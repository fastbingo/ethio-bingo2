"use strict";

/*
==========================================================
ETHIOPIA BINGO - TELEGRAM MINI APP
==========================================================
*/

/*
  IMPORTANT:
  Replace this with your REAL Cloudflare Worker URL.

  Example:
  const API_BASE = "https://ethiopia-bingo-api.example.workers.dev";
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
  } catch (error) {
    console.warn("Telegram appearance settings unavailable.");
  }
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

  currentPage: "home",

  lastCalledNumber: null
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

  if (!box) {
    console.log(message);
    return;
  }

  box.textContent = message;
  box.classList.add("show");

  clearTimeout(messageTimer);

  messageTimer = setTimeout(() => {
    box.classList.remove("show");
  }, 3500);
}


/* ========================================================
   API
======================================================== */

async function api(path, options = {}) {

  if (!API_BASE ||
      API_BASE.includes("YOUR-WORKER-URL")) {

    throw new Error(
      "Please set your Cloudflare Worker URL in app.js."
    );
  }

  const headers = {
    ...(options.headers || {})
  };


  /*
    Telegram Mini App authentication.

    The Worker uses this to identify the Telegram user.
  */

  if (tg?.initData) {

    headers["X-Telegram-Init-Data"] =
      tg.initData;
  }


  /*
    JSON requests.
  */

  if (
    options.body &&
    !headers["Content-Type"]
  ) {

    headers["Content-Type"] =
      "application/json";
  }


  const response = await fetch(
    `${API_BASE}${path}`,
    {
      ...options,
      headers
    }
  );


  let data;

  try {

    data = await response.json();

  } catch (error) {

    data = {
      ok: false,
      error: "Invalid server response."
    };
  }


  if (
    !response.ok ||
    data.ok === false
  ) {

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

    /*
      The Mini App must be opened from Telegram.
    */

    if (!tg) {

      showMessage(
        "Please open Ethiopia Bingo inside Telegram."
      );

      return;
    }


    /*
      Telegram initData is required by the Worker.
    */

    if (!tg.initData) {

      showMessage(
        "Telegram authentication is unavailable. Open Ethiopia Bingo from the Telegram bot."
      );

      return;
    }


    await loadMe();


    /*
      Contact is required before playing.
    */

    if (
      !state.user?.contact_verified
    ) {

      openModal("contactModal");

      return;
    }


    await loadGame();
    await loadRank();

  } catch (error) {

    console.error(
      "Initialization error:",
      error
    );

    showMessage(
      error.message ||
      "Unable to connect to Ethiopia Bingo."
    );
  }
}


/* ========================================================
   USER
======================================================== */

async function loadMe() {

  const data =
    await api("/api/me");


  state.user =
    data.user || null;


  if (!state.user) {

    throw new Error(
      "User information unavailable."
    );
  }


  state.balance =
    Number(
      state.user.balance || 0
    );


  updateUserUI();
}


function updateUserUI() {

  const user =
    state.user || {};


  const name =
    user.first_name ||
    user.username ||
    "Player";


  if ($("playerName")) {

    $("playerName").textContent =
      name;
  }


  const initial =
    name.charAt(0).toUpperCase();


  if ($("playerAvatar")) {

    $("playerAvatar").textContent =
      initial;
  }


  if ($("profileInitial")) {

    $("profileInitial").textContent =
      initial;
  }


  if ($("walletBalance")) {

    $("walletBalance").textContent =
      formatMoney(state.balance);
  }


  if ($("walletLargeBalance")) {

    $("walletLargeBalance").textContent =
      formatMoney(state.balance);
  }
}


function formatMoney(value) {

  return Number(value || 0)
    .toLocaleString("en-US");
}


/* ========================================================
   CONTACT VERIFICATION
======================================================== */

/*
  Telegram does NOT provide the user's phone number
  directly to the Mini App JavaScript.

  requestContact() only tells us whether the user
  accepted the contact request.

  The actual contact must be received by the Telegram bot.

  After that, the Mini App checks the Worker using
  /api/contact-status.
*/


const contactButton =
  $("requestContactButton");


if (contactButton) {

  contactButton.addEventListener(
    "click",
    requestContact
  );
}


/*
  Telegram contactRequested event.
*/

if (
  tg &&
  typeof tg.onEvent === "function"
) {

  tg.onEvent(
    "contactRequested",
    async (event) => {

      console.log(
        "Telegram contactRequested:",
        event
      );


      if (
        event &&
        event.status === "sent"
      ) {

        showMessage(
          "Contact shared. Verifying..."
        );


        await verifyContactFromServer();

      } else {

        showMessage(
          "Contact sharing was cancelled."
        );
      }

    }
  );
}


/*
  Ask Telegram to request the user's contact.
*/

async function requestContact() {

  if (!tg) {

    showMessage(
      "Please open Ethiopia Bingo inside Telegram."
    );

    return;
  }


  if (!tg.initData) {

    showMessage(
      "Telegram authentication is unavailable. Please open Ethiopia Bingo from the bot."
    );

    return;
  }


  if (
    typeof tg.requestContact !== "function"
  ) {

    showMessage(
      "Contact sharing is unavailable in this Telegram version."
    );

    return;
  }


  try {

    /*
      Telegram returns a boolean.

      true  = contact was shared
      false = cancelled
    */

    tg.requestContact(
      async (shared) => {

        console.log(
          "Telegram requestContact result:",
          shared
        );


        if (shared === true) {

          showMessage(
            "Contact shared. Verifying..."
          );


          await verifyContactFromServer();

        } else {

          showMessage(
            "Contact sharing was cancelled."
          );
        }

      }
    );

  } catch (error) {

    console.error(
      "requestContact error:",
      error
    );


    showMessage(
      error.message ||
      "Unable to request your contact."
    );
  }
}


/*
  Check the Worker repeatedly.

  Telegram needs a short amount of time to deliver
  the contact message to the bot.
*/

async function verifyContactFromServer() {

  const attempts = 8;

  for (
    let attempt = 0;
    attempt < attempts;
    attempt++
  ) {

    try {

      const data =
        await api(
          "/api/contact-status"
        );


      console.log(
        "Contact status:",
        data
      );


      const verified =
        data.contact_verified === true ||
        data.verified === true ||
        data.user?.contact_verified === true;


      if (verified) {

        closeModal(
          "contactModal"
        );


        await loadMe();

        await loadGame();

        await loadRank();


        showMessage(
          "Contact verified successfully."
        );


        return;
      }


    } catch (error) {

      console.error(
        "Contact status error:",
        error
      );
    }


    /*
      Wait one second before checking again.
    */

    if (
      attempt < attempts - 1
    ) {

      await sleep(1000);
    }
  }


  showMessage(
    "Your contact was shared, but the bot has not verified it yet. Please try again."
  );
}


function sleep(milliseconds) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


/* ========================================================
   GAME
======================================================== */

async function loadGame() {

  try {

    const data =
      await api("/api/game");


    state.game =
      data.game || null;


    state.calledNumbers =
      Array.isArray(data.called_numbers)
        ? data.called_numbers
        : [];


    state.myTickets =
      Array.isArray(data.tickets)
        ? data.tickets
        : [];


    renderGame();

  } catch (error) {

    console.error(
      "Game loading error:",
      error
    );


    if (
      error.message
        .toLowerCase()
        .includes("contact")
    ) {

      openModal(
        "contactModal"
      );

    } else {

      showMessage(
        error.message
      );
    }
  }
}


function renderGame() {

  if (!state.game) {

    return;
  }


  renderGameStatus();

  renderMasterBoard();

  renderMyTickets();

  updateCountdown();


  if (
    state.game.status === "waiting" ||
    state.game.status === "active"
  ) {

    startPolling();

  } else {

    stopPolling();
  }
}


/* ========================================================
   GAME STATUS
======================================================== */

function renderGameStatus() {

  const status =
    state.game?.status ||
    "waiting";


  let text =
    "Waiting";


  if (
    status === "active"
  ) {

    text =
      "Game Live";
  }


  if (
    status === "finished"
  ) {

    text =
      "Finished";
  }


  if ($("gameStatus")) {

    $("gameStatus").textContent =
      text;
  }


  const count =
    Number(
      state.game?.called_count || 0
    );


  if ($("calledCount")) {

    $("calledCount").textContent =
      `${count} / 20`;
  }
}


/* ========================================================
   MASTER BOARD
======================================================== */

function renderMasterBoard() {

  const board =
    $("masterBoard");


  if (!board) {

    return;
  }


  board.innerHTML = "";


  const called =
    new Set(
      state.calledNumbers
        .map(Number)
    );


  for (
    let number = 1;
    number <= 75;
    number++
  ) {

    const cell =
      document.createElement(
        "div"
      );


    cell.className =
      "board-number";


    if (
      called.has(number)
    ) {

      cell.classList.add(
        "called"
      );
    }


    cell.textContent =
      number;


    board.appendChild(
      cell
    );
  }
}


/* ========================================================
   TICKET SELECTOR
======================================================== */

function renderTicketSelector() {

  const grid =
    $("ticketGrid");


  if (!grid) {

    return;
  }


  grid.innerHTML = "";


  for (
    let number = 1;
    number <= 500;
    number++
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "ticket-number";


    button.textContent =
      number;


    if (
      state.selectedTickets
        .includes(number)
    ) {

      button.classList.add(
        "selected"
      );
    }


    button.addEventListener(
      "click",
      () => toggleTicket(number)
    );


    grid.appendChild(
      button
    );
  }


  if (
    $("selectedTicketCount")
  ) {

    $("selectedTicketCount")
      .textContent =
      state.selectedTickets.length;
  }


  if (
    $("selectedTicketCost")
  ) {

    $("selectedTicketCost")
      .textContent =
      `${state.selectedTickets.length * 10} ETB`;
  }
}


function toggleTicket(number) {

  const existing =
    state.selectedTickets
      .indexOf(number);


  if (
    existing >= 0
  ) {

    state.selectedTickets
      .splice(
        existing,
        1
      );

  } else {

    if (
      state.selectedTickets.length >= 4
    ) {

      showMessage(
        "You can select a maximum of 4 tickets."
      );

      return;
    }


    const newCost =
      (
        state.selectedTickets.length +
        1
      ) * 10;


    if (
      state.balance < newCost
    ) {

      showMessage(
        "Insufficient wallet balance."
      );

      return;
    }


    state.selectedTickets
      .push(number);
  }


  state.selectedTickets
    .sort(
      (a, b) => a - b
    );


  renderTicketSelector();
}


/* ========================================================
   JOIN GAME
======================================================== */

const joinButton =
  $("joinGameButton");


if (joinButton) {

  joinButton.addEventListener(
    "click",
    joinGame
  );
}


async function joinGame() {

  if (
    !state.user?.contact_verified
  ) {

    openModal(
      "contactModal"
    );

    return;
  }


  if (
    !state.selectedTickets.length
  ) {

    showMessage(
      "Select at least one ticket."
    );

    return;
  }


  const cost =
    state.selectedTickets.length *
    10;


  if (
    state.balance < cost
  ) {

    showMessage(
      "Insufficient wallet balance."
    );

    return;
  }


  try {

    if (joinButton) {

      joinButton.disabled =
        true;

      joinButton.textContent =
        "Joining...";
    }


    const data =
      await api(
        "/api/join",
        {
          method: "POST",

          body:
            JSON.stringify({
              ticket_numbers:
                state.selectedTickets
            })
        }
      );


    state.balance =
      Number(
        data.balance ??
        (
          state.balance -
          cost
        )
      );


    state.selectedTickets =
      [];


    updateUserUI();

    renderTicketSelector();

    await loadGame();


    showMessage(
      "You joined the game successfully."
    );


  } catch (error) {

    console.error(
      "Join error:",
      error
    );


    showMessage(
      error.message
    );


  } finally {

    if (joinButton) {

      joinButton.disabled =
        false;

      joinButton.textContent =
        "Join Game";
    }
  }
}


/* ========================================================
   MY TICKETS
======================================================== */

function renderMyTickets() {

  const container =
    $("myTickets");


  if (!container) {

    return;
  }


  container.innerHTML =
    "";


  if (
    !state.myTickets.length
  ) {

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
    new Set(
      state.calledNumbers
        .map(Number)
    );


  for (
    const ticket of state.myTickets
  ) {

    const card =
      document.createElement(
        "div"
      );


    card.className =
      "ticket-card";


    const header =
      document.createElement(
        "div"
      );


    header.className =
      "ticket-card-header";


    header.innerHTML = `
      <div class="ticket-title">
        Ticket #${escapeHTML(
          ticket.ticket_number
        )}
      </div>

      <div class="ticket-state">
        ${escapeHTML(
          state.game?.status ||
          "waiting"
        )}
      </div>
    `;


    card.appendChild(
      header
    );


    /*
      Support both:

      ticket.card
      ticket.card_data
    */

    let numbers;


    try {

      const rawCard =
        ticket.card ??
        ticket.card_data ??
        ticket.card_json ??
        null;


      numbers =
        typeof rawCard === "string"
          ? JSON.parse(rawCard)
          : rawCard;

    } catch (error) {

      console.error(
        "Unable to parse ticket card:",
        error
      );

      numbers =
        [];
    }


    if (
      !Array.isArray(numbers)
    ) {

      numbers =
        [];
    }


    const grid =
      document.createElement(
        "div"
      );


    grid.className =
      "bingo-card";


    for (
      let row = 0;
      row < 5;
      row++
    ) {

      for (
        let col = 0;
        col < 5;
        col++
      ) {

        const value =
          numbers?.[row]?.[col];


        const cell =
          document.createElement(
            "div"
          );


        cell.className =
          "bingo-cell";


        /*
          FREE center.
        */

        if (
          row === 2 &&
          col === 2 &&
          (
            value === 0 ||
            value === "0" ||
            value === null
          )
        ) {

          cell.classList.add(
            "free"
          );

          cell.textContent =
            "FREE";

        } else {

          const number =
            Number(value);


          cell.textContent =
            Number.isFinite(number)
              ? number
              : "";


          if (
            Number.isFinite(number) &&
            called.has(number)
          ) {

            cell.classList.add(
              "called"
            );
          }
        }


        grid.appendChild(
          cell
        );
      }
    }


    card.appendChild(
      grid
    );


    container.appendChild(
      card
    );
  }
}


/* ========================================================
   POLLING
======================================================== */

function startPolling() {

  if (
    state.polling
  ) {

    return;
  }


  state.polling =
    setInterval(
      async () => {

        try {

          await loadGame();

        } catch (error) {

          console.error(
            "Polling error:",
            error
          );
        }

      },
      2000
    );
}


function stopPolling() {

  if (
    state.polling
  ) {

    clearInterval(
      state.polling
    );

    state.polling =
      null;
  }
}


/* ========================================================
   COUNTDOWN
======================================================== */

function updateCountdown() {

  clearInterval(
    state.countdownTimer
  );


  if (!state.game) {

    if ($("countdown")) {

      $("countdown")
        .textContent =
        "--";
    }

    return;
  }


  if (
    state.game.status !==
    "waiting"
  ) {

    if ($("countdown")) {

      $("countdown")
        .textContent =
        "LIVE";
    }

    return;
  }


  const created =
    new Date(
      state.game.created_at
    ).getTime();


  if (
    !created ||
    Number.isNaN(created)
  ) {

    if ($("countdown")) {

      $("countdown")
        .textContent =
        "--";
    }

    return;
  }


  state.countdownTimer =
    setInterval(
      () => {

        const elapsed =
          Math.floor(
            (
              Date.now() -
              created
            ) / 1000
          );


        const remaining =
          Math.max(
            0,
            20 - elapsed
          );


        if ($("countdown")) {

          $("countdown")
            .textContent =
            remaining;
        }


        if (
          remaining <= 0
        ) {

          clearInterval(
            state.countdownTimer
          );

          loadGame();
        }

      },
      500
    );
}


/* ========================================================
   RANKINGS
======================================================== */

async function loadRank() {

  try {

    const data =
      await api(
        "/api/rank"
      );


    renderRank(
      data.players ||
      data.rank ||
      []
    );

  } catch (error) {

    console.error(
      "Ranking error:",
      error
    );
  }
}


function renderRank(players) {

  const container =
    $("rankingList");


  if (!container) {

    return;
  }


  container.innerHTML =
    "";


  if (!players.length) {

    container.innerHTML = `
      <div class="info-card">
        <p>No rankings yet.</p>
      </div>
    `;

    return;
  }


  players.forEach(
    (player, index) => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "rank-row";


      const name =
        player.first_name ||
        player.username ||
        "Player";


      const initial =
        name
          .charAt(0)
          .toUpperCase();


      const winnings =
        Number(
          player.total_won ||
          0
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


      container.appendChild(
        row
      );
    }
  );
}


/* ========================================================
   NAVIGATION
======================================================== */

document
  .querySelectorAll(".nav-btn")
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          const page =
            button.dataset.page;

          showPage(page);
        }
      );
    }
  );


function showPage(page) {

  state.currentPage =
    page;


  document
    .querySelectorAll(".page")
    .forEach(
      p => {

        p.classList.remove(
          "active"
        );
      }
    );


  const target =
    $(`${page}Page`);


  if (target) {

    target.classList.add(
      "active"
    );
  }


  document
    .querySelectorAll(".nav-btn")
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page === page
        );
      }
    );


  if (
    page === "game"
  ) {

    renderTicketSelector();

    loadGame();
  }


  if (
    page === "rank"
  ) {

    loadRank();
  }
}


/* ========================================================
   HOME BUTTONS
======================================================== */

if ($("playButton")) {

  $("playButton").addEventListener(
    "click",
    () => showPage("game")
  );
}


if ($("depositHome")) {

  $("depositHome").addEventListener(
    "click",
    () => openModal("depositModal")
  );
}


if ($("withdrawHome")) {

  $("withdrawHome").addEventListener(
    "click",
    () => openModal("withdrawModal")
  );
}


if ($("depositButton")) {

  $("depositButton").addEventListener(
    "click",
    () => openModal("depositModal")
  );
}


if ($("withdrawButton")) {

  $("withdrawButton").addEventListener(
    "click",
    () => openModal("withdrawModal")
  );
}


/* ========================================================
   DEPOSIT
======================================================== */

if ($("submitDepositButton")) {

  $("submitDepositButton")
    .addEventListener(
      "click",
      submitDeposit
    );
}


async function submitDeposit() {

  const amount =
    Number(
      $("depositAmount")?.value
    );


  const reference =
    $("depositReference")
      ?.value
      .trim();


  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

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

    $("submitDepositButton")
      .disabled = true;


    $("submitDepositButton")
      .textContent =
      "Submitting...";


    await api(
      "/api/credit-request",
      {
        method: "POST",

        body:
          JSON.stringify({
            amount,
            reference
          })
      }
    );


    $("depositAmount").value =
      "";


    $("depositReference").value =
      "";


    closeModal(
      "depositModal"
    );


    showMessage(
      "Deposit submitted for admin approval."
    );


  } catch (error) {

    showMessage(
      error.message
    );


  } finally {

    $("submitDepositButton")
      .disabled = false;


    $("submitDepositButton")
      .textContent =
      "Submit Deposit";
  }
}


/* ========================================================
   WITHDRAW
======================================================== */

if ($("submitWithdrawButton")) {

  $("submitWithdrawButton")
    .addEventListener(
      "click",
      submitWithdrawal
    );
}


async function submitWithdrawal() {

  const amount =
    Number(
      $("withdrawAmount")?.value
    );


  const phone =
    $("withdrawPhone")
      ?.value
      .trim();


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showMessage(
      "Enter a valid withdrawal amount."
    );

    return;
  }


  if (
    amount > state.balance
  ) {

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

    $("submitWithdrawButton")
      .disabled = true;


    $("submitWithdrawButton")
      .textContent =
      "Submitting...";


    await api(
      "/api/withdrawal-request",
      {
        method: "POST",

        body:
          JSON.stringify({
            amount,
            phone_number: phone
          })
      }
    );


    $("withdrawAmount").value =
      "";


    $("withdrawPhone").value =
      "";


    closeModal(
      "withdrawModal"
    );


    showMessage(
      "Withdrawal submitted for admin approval."
    );


  } catch (error) {

    showMessage(
      error.message
    );


  } finally {

    $("submitWithdrawButton")
      .disabled = false;


    $("submitWithdrawButton")
      .textContent =
      "Submit Withdrawal";
  }
}


/* ========================================================
   MODALS
======================================================== */

function openModal(id) {

  const modal =
    $(id);


  if (modal) {

    modal.classList.add(
      "show"
    );
  }
}


function closeModal(id) {

  const modal =
    $(id);


  if (modal) {

    modal.classList.remove(
      "show"
    );
  }
}


/*
  Close buttons.
*/

document
  .querySelectorAll("[data-close]")
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          closeModal(
            button.dataset.close
          );
        }
      );
    }
  );


/*
  Close normal modals by clicking outside.

  Contact modal remains locked.
*/

document
  .querySelectorAll(".modal")
  .forEach(
    modal => {

      modal.addEventListener(
        "click",
        event => {

          if (
            event.target === modal &&
            modal.id !==
              "contactModal"
          ) {

            modal.classList.remove(
              "show"
            );
          }
        }
      );
    }
  );


/* ========================================================
   SECURITY / HTML
======================================================== */

function escapeHTML(value) {

  return String(value)
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}


/* ========================================================
   START
======================================================== */

renderTicketSelector();

initialize();
