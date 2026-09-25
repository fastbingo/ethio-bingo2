"use strict";

/*
==========================================================
ETHIOPIA BINGO - MINI APP
==========================================================
*/

const API_BASE = "https://ethio-bingo.ketiolcj.workers.dev";


/* ========================================================
   TELEGRAM
======================================================== */

const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#11172a");
    tg.setBackgroundColor("#0d1120");
  } catch (e) {}
}


/* ========================================================
   STATE
======================================================== */

const state = {
  user: null,
  balance: 0,

  game: null,
  calledNumbers: [],

  selectedTickets: [],
  myTickets: [],

  polling: null,
  countdownTimer: null,

  currentPage: "home"
};


/* ========================================================
   DOM
======================================================== */

const $ = (id) => document.getElementById(id);


/* ========================================================
   MESSAGE
======================================================== */

let messageTimer = null;

function showMessage(message) {

  const box = $("messageBox");

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");

  clearTimeout(messageTimer);

  messageTimer = setTimeout(() => {
    box.classList.remove("show");
  }, 3000);
}


/* ========================================================
   API
======================================================== */

async function api(path, options = {}) {

  const headers = {
    ...(options.headers || {})
  };

  if (tg?.initData) {
    headers["X-Telegram-Init-Data"] = tg.initData;
  }

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  let data;

  try {
    data = await response.json();
  } catch {
    data = {
      ok: false,
      error: "Invalid server response"
    };
  }

  if (!response.ok || data.ok === false) {
    throw new Error(
      data.error ||
      data.message ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* ========================================================
   INITIALIZATION
======================================================== */

async function initialize() {

  try {

    if (!tg?.initData) {
      showMessage("Please open Ethiopia Bingo from Telegram.");
      return;
    }

    await loadMe();

    if (!state.user?.contact_verified) {

      openModal("contactModal");

    } else {

      await loadGame();
      await loadRank();

    }

  } catch (error) {

    console.error(error);

    showMessage(error.message || "Unable to connect.");
  }
}


/* ========================================================
   USER
======================================================== */

async function loadMe() {

  const data = await api("/api/me");

  state.user = data.user || null;

  if (!state.user) {
    throw new Error("User information unavailable.");
  }

  state.balance = Number(state.user.balance || 0);

  updateUserUI();
}


function updateUserUI() {

  const user = state.user || {};

  const name =
    user.first_name ||
    user.username ||
    "Player";

  $("playerName").textContent = name;

  const initial =
    name.charAt(0).toUpperCase();

  $("playerAvatar").textContent = initial;
  $("profileInitial").textContent = initial;

  $("walletBalance").textContent =
    formatMoney(state.balance);

  $("walletLargeBalance").textContent =
    formatMoney(state.balance);
}


function formatMoney(value) {

  return Number(value || 0)
    .toLocaleString("en-US");
}


/* ========================================================
   CONTACT
======================================================== */

$("requestContactButton").addEventListener(
  "click",
  requestContact
);


async function requestContact() {

  if (!tg) {
    showMessage("Telegram is required.");
    return;
  }

  try {

    /*
      Telegram will request the user's contact.
    */

    if (!tg.requestContact) {

      showMessage(
        "Contact sharing is unavailable in this Telegram version."
      );

      return;
    }

    tg.requestContact(async (shared) => {

      if (!shared) {

        showMessage("Contact sharing was cancelled.");
        return;
      }

      try {

        /*
          Depending on Telegram version, the callback may
          provide the phone number directly or contact data.
        */

        let phone = "";

        if (typeof shared === "string") {
          phone = shared;
        } else {
          phone =
            shared.phone_number ||
            shared.phoneNumber ||
            "";
        }

        if (!phone) {

          showMessage(
            "Telegram did not provide the phone number."
          );

          return;
        }

        await api("/api/contact", {
          method: "POST",
          body: JSON.stringify({
            phone_number: phone
          })
        });

        closeModal("contactModal");

        await loadMe();
        await loadGame();

        showMessage("Contact verified successfully.");

      } catch (error) {

        console.error(error);
        showMessage(error.message);
      }

    });

  } catch (error) {

    console.error(error);
    showMessage(error.message);
  }
}


/* ========================================================
   GAME
======================================================== */

async function loadGame() {

  try {

    const data = await api("/api/game");

    state.game = data.game || null;
    state.calledNumbers =
      data.called_numbers || [];

    state.myTickets =
      data.tickets || [];

    renderGame();

  } catch (error) {

    console.error(error);

    if (
      error.message.toLowerCase().includes("contact")
    ) {
      openModal("contactModal");
    } else {
      showMessage(error.message);
    }
  }
}


function renderGame() {

  if (!state.game) return;

  renderGameStatus();
  renderMasterBoard();
  renderMyTickets();

  updateCountdown();

  if (
    state.game.status === "waiting" ||
    state.game.status === "active"
  ) {
    startPolling();
  }
}


function renderGameStatus() {

  const status =
    state.game?.status || "waiting";

  let text = "Waiting";

  if (status === "active") {
    text = "Game Live";
  }

  if (status === "finished") {
    text = "Finished";
  }

  $("gameStatus").textContent = text;

  const count =
    Number(state.game?.called_count || 0);

  $("calledCount").textContent =
    `${count} / 20`;
}


/* ========================================================
   MASTER BOARD
======================================================== */

function renderMasterBoard() {

  const board = $("masterBoard");

  board.innerHTML = "";

  const called =
    new Set(state.calledNumbers.map(Number));

  for (let number = 1; number <= 75; number++) {

    const cell =
      document.createElement("div");

    cell.className = "board-number";

    if (called.has(number)) {
      cell.classList.add("called");
    }

    cell.textContent = number;

    board.appendChild(cell);
  }
}


/* ========================================================
   TICKET SELECTOR
======================================================== */

function renderTicketSelector() {

  const grid = $("ticketGrid");

  if (!grid) return;

  grid.innerHTML = "";

  for (let number = 1; number <= 500; number++) {

    const button =
      document.createElement("button");

    button.className = "ticket-number";

    button.textContent = number;

    if (
      state.selectedTickets.includes(number)
    ) {
      button.classList.add("selected");
    }

    button.addEventListener(
      "click",
      () => toggleTicket(number)
    );

    grid.appendChild(button);
  }

  $("selectedTicketCount").textContent =
    state.selectedTickets.length;
}


function toggleTicket(number) {

  const existing =
    state.selectedTickets.indexOf(number);

  if (existing >= 0) {

    state.selectedTickets.splice(existing, 1);

  } else {

    if (state.selectedTickets.length >= 4) {

      showMessage(
        "You can select a maximum of 4 tickets."
      );

      return;
    }

    if (state.balance <
        (state.selectedTickets.length + 1) * 10) {

      showMessage(
        "Insufficient wallet balance."
      );

      return;
    }

    state.selectedTickets.push(number);
  }

  state.selectedTickets.sort((a, b) => a - b);

  renderTicketSelector();
}


/* ========================================================
   JOIN GAME
======================================================== */

$("joinGameButton").addEventListener(
  "click",
  joinGame
);


async function joinGame() {

  if (!state.user?.contact_verified) {

    openModal("contactModal");
    return;
  }

  if (!state.selectedTickets.length) {

    showMessage(
      "Select at least one ticket."
    );

    return;
  }

  const cost =
    state.selectedTickets.length * 10;

  if (state.balance < cost) {

    showMessage(
      "Insufficient wallet balance."
    );

    return;
  }

  try {

    $("joinGameButton").disabled = true;
    $("joinGameButton").textContent =
      "Joining...";

    const data = await api("/api/join", {
      method: "POST",
      body: JSON.stringify({
        ticket_numbers:
          state.selectedTickets
      })
    });

    state.balance =
      Number(data.balance ?? state.balance - cost);

    state.selectedTickets = [];

    updateUserUI();
    renderTicketSelector();

    await loadGame();

    showMessage(
      "You joined the game successfully."
    );

  } catch (error) {

    console.error(error);

    showMessage(error.message);

  } finally {

    $("joinGameButton").disabled = false;
    $("joinGameButton").textContent =
      "Join Game";
  }
}


/* ========================================================
   MY TICKETS
======================================================== */

function renderMyTickets() {

  const container =
    $("myTickets");

  container.innerHTML = "";

  if (!state.myTickets.length) {

    container.innerHTML = `
      <div class="info-card">
        <p>
          You have not joined this game yet.
        </p>
      </div>
    `;

    return;
  }

  const called =
    new Set(state.calledNumbers.map(Number));

  for (const ticket of state.myTickets) {

    const card =
      document.createElement("div");

    card.className = "ticket-card";

    const header =
      document.createElement("div");

    header.className =
      "ticket-card-header";

    header.innerHTML = `
      <div class="ticket-title">
        Ticket #${ticket.ticket_number}
      </div>
      <div class="ticket-state">
        ${state.game?.status || "waiting"}
      </div>
    `;

    card.appendChild(header);

    let numbers;

    try {

      numbers =
        typeof ticket.card === "string"
          ? JSON.parse(ticket.card)
          : ticket.card;

    } catch {

      numbers = [];
    }

    if (!Array.isArray(numbers)) {
      numbers = [];
    }

    const grid =
      document.createElement("div");

    grid.className = "bingo-card";

    for (let row = 0; row < 5; row++) {

      for (let col = 0; col < 5; col++) {

        const value =
          numbers?.[row]?.[col];

        const cell =
          document.createElement("div");

        cell.className = "bingo-cell";

        if (
          row === 2 &&
          col === 2 &&
          (value === 0 ||
           value === "0" ||
           value === null)
        ) {

          cell.classList.add("free");
          cell.textContent = "FREE";

        } else {

          const number =
            Number(value);

          cell.textContent =
            Number.isFinite(number)
              ? number
              : "";

          if (
            called.has(number)
          ) {
            cell.classList.add("called");
          }
        }

        grid.appendChild(cell);
      }
    }

    card.appendChild(grid);

    container.appendChild(card);
  }
}


/* ========================================================
   POLLING
======================================================== */

function startPolling() {

  if (state.polling) return;

  state.polling =
    setInterval(async () => {

      try {
        await loadGame();
      } catch (error) {
        console.error(error);
      }

    }, 2000);
}


function stopPolling() {

  if (state.polling) {

    clearInterval(state.polling);
    state.polling = null;
  }
}


/* ========================================================
   COUNTDOWN
======================================================== */

function updateCountdown() {

  clearInterval(state.countdownTimer);

  if (!state.game) {

    $("countdown").textContent = "--";
    return;
  }

  if (state.game.status !== "waiting") {

    $("countdown").textContent = "LIVE";
    return;
  }

  /*
    The Worker controls the actual 20-second wait.
    We calculate a visual countdown from created_at.
  */

  const created =
    new Date(state.game.created_at).getTime();

  if (!created) {

    $("countdown").textContent = "--";
    return;
  }

  state.countdownTimer =
    setInterval(() => {

      const elapsed =
        Math.floor(
          (Date.now() - created) / 1000
        );

      const remaining =
        Math.max(
          0,
          20 - elapsed
        );

      $("countdown").textContent =
        remaining;

      if (remaining <= 0) {

        clearInterval(
          state.countdownTimer
        );

        loadGame();
      }

    }, 500);

}


/* ========================================================
   RANKINGS
======================================================== */

async function loadRank() {

  try {

    const data =
      await api("/api/rank");

    renderRank(data.players || data.rank || []);

  } catch (error) {

    console.error(error);
  }
}


function renderRank(players) {

  const container =
    $("rankingList");

  container.innerHTML = "";

  if (!players.length) {

    container.innerHTML = `
      <div class="info-card">
        <p>No rankings yet.</p>
      </div>
    `;

    return;
  }

  players.forEach((player, index) => {

    const row =
      document.createElement("div");

    row.className = "rank-row";

    const name =
      player.first_name ||
      player.username ||
      "Player";

    const initial =
      name.charAt(0).toUpperCase();

    const winnings =
      Number(
        player.total_won || 0
      );

    row.innerHTML = `
      <div class="rank-position">
        ${index + 1}
      </div>

      <div class="rank-avatar">
        ${escapeHTML(initial)}
      </div>

      <div class="rank-name">
        ${escapeHTML(name)}
      </div>

      <div class="rank-prize">
        ${formatMoney(winnings)} ETB
      </div>
    `;

    container.appendChild(row);
  });
}


/* ========================================================
   NAVIGATION
======================================================== */

document
  .querySelectorAll(".nav-btn")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        showPage(page);
      }
    );
  });


function showPage(page) {

  state.currentPage = page;

  document
    .querySelectorAll(".page")
    .forEach(p => {
      p.classList.remove("active");
    });

  const target =
    $(`${page}Page`);

  if (target) {
    target.classList.add("active");
  }

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });

  if (page === "game") {

    renderTicketSelector();
    loadGame();
  }

  if (page === "rank") {
    loadRank();
  }
}


/* ========================================================
   HOME BUTTONS
======================================================== */

$("playButton").addEventListener(
  "click",
  () => showPage("game")
);

$("depositHome").addEventListener(
  "click",
  () => openModal("depositModal")
);

$("withdrawHome").addEventListener(
  "click",
  () => openModal("withdrawModal")
);

$("depositButton").addEventListener(
  "click",
  () => openModal("depositModal")
);

$("withdrawButton").addEventListener(
  "click",
  () => openModal("withdrawModal")
);


/* ========================================================
   DEPOSIT
======================================================== */

$("submitDepositButton")
  .addEventListener(
    "click",
    submitDeposit
  );


async function submitDeposit() {

  const amount =
    Number(
      $("depositAmount").value
    );

  const reference =
    $("depositReference")
      .value
      .trim();

  if (!Number.isFinite(amount) ||
      amount < 50) {

    showMessage(
      "Minimum deposit is 50 ETB."
    );

    return;
  }

  if (!reference) {

    showMessage(
      "Enter your Telebirr transaction reference."
    );

    return;
  }

  try {

    $("submitDepositButton").disabled = true;

    $("submitDepositButton").textContent =
      "Submitting...";

    await api("/api/credit-request", {
      method: "POST",
      body: JSON.stringify({
        amount,
        reference
      })
    });

    $("depositAmount").value = "";
    $("depositReference").value = "";

    closeModal("depositModal");

    showMessage(
      "Deposit submitted for admin approval."
    );

  } catch (error) {

    showMessage(error.message);

  } finally {

    $("submitDepositButton").disabled = false;

    $("submitDepositButton").textContent =
      "Submit Deposit";
  }
}


/* ========================================================
   WITHDRAW
======================================================== */

$("submitWithdrawButton")
  .addEventListener(
    "click",
    submitWithdrawal
  );


async function submitWithdrawal() {

  const amount =
    Number(
      $("withdrawAmount").value
    );

  const phone =
    $("withdrawPhone")
      .value
      .trim();

  if (!Number.isFinite(amount) ||
      amount <= 0) {

    showMessage(
      "Enter a valid withdrawal amount."
    );

    return;
  }

  if (amount > state.balance) {

    showMessage(
      "Insufficient wallet balance."
    );

    return;
  }

  if (!phone) {

    showMessage(
      "Enter your Telebirr phone number."
    );

    return;
  }

  try {

    $("submitWithdrawButton").disabled = true;

    $("submitWithdrawButton").textContent =
      "Submitting...";

    await api("/api/withdrawal-request", {
      method: "POST",
      body: JSON.stringify({
        amount,
        phone_number: phone
      })
    });

    $("withdrawAmount").value = "";
    $("withdrawPhone").value = "";

    closeModal("withdrawModal");

    showMessage(
      "Withdrawal submitted for admin approval."
    );

  } catch (error) {

    showMessage(error.message);

  } finally {

    $("submitWithdrawButton").disabled = false;

    $("submitWithdrawButton").textContent =
      "Submit Withdrawal";
  }
}


/* ========================================================
   MODALS
======================================================== */

function openModal(id) {

  const modal = $(id);

  if (modal) {
    modal.classList.add("show");
  }
}


function closeModal(id) {

  const modal = $(id);

  if (modal) {
    modal.classList.remove("show");
  }
}


document
  .querySelectorAll("[data-close]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {
        closeModal(button.dataset.close);
      }
    );
  });


document
  .querySelectorAll(".modal")
  .forEach(modal => {

    modal.addEventListener(
      "click",
      event => {

        if (event.target === modal &&
            modal.id !== "contactModal") {

          modal.classList.remove("show");
        }
      }
    );
  });


/* ========================================================
   SECURITY / HTML
======================================================== */

function escapeHTML(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ========================================================
   START
======================================================== */

renderTicketSelector();

initialize();
