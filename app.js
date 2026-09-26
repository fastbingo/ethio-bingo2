"use strict";

/*
  =========================================================
  ETHIOPIA BINGO
  Telegram Mini App Frontend
  Cloudflare Worker + D1
  =========================================================
*/

const API_BASE =
  "https://ethio-bingo.ketiolcj.workers.dev";

const CONFIG = {
  MAX_TICKETS: 4,
  TOTAL_TICKETS: 500,
  TICKET_PRICE: 10,
  MIN_DEPOSIT: 50,
  TOTAL_DRAWS: 20,
  REFRESH_MS: 5000
};


/* =========================================================
   STATE
========================================================= */

const state = {
  telegram: null,

  user: null,

  game: null,

  selectedTickets: new Set(),

  myTickets: [],

  calledNumbers: [],

  loading: false,

  initialized: false,

  contactVerified: false,

  contactChecking: false,

  refreshTimer: null,

  toastTimer: null
};


/* =========================================================
   DOM
========================================================= */

const $ = (id) =>
  document.getElementById(id);


/* =========================================================
   TELEGRAM
========================================================= */

function initTelegram() {

  const tg =
    window.Telegram &&
    window.Telegram.WebApp
      ? window.Telegram.WebApp
      : null;

  state.telegram = tg;

  if (!tg) {
    setConnection("Browser mode");
    return;
  }

  try {

    tg.ready();

    tg.expand();

    if (typeof tg.setHeaderColor === "function") {
      tg.setHeaderColor("#080d1b");
    }

    if (typeof tg.setBackgroundColor === "function") {
      tg.setBackgroundColor("#080d1b");
    }

    if (
      typeof tg.disableVerticalSwipes ===
      "function"
    ) {
      tg.disableVerticalSwipes();
    }

    setConnection("Connected");

  } catch (error) {

    console.warn(
      "Telegram initialization error:",
      error
    );

    setConnection("Connected");
  }
}


function getInitData() {

  if (
    state.telegram &&
    typeof state.telegram.initData ===
      "string"
  ) {
    return state.telegram.initData;
  }

  return "";
}


/* =========================================================
   API
========================================================= */

async function api(
  path,
  options = {}
) {

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const initData =
    getInitData();

  if (initData) {
    headers[
      "X-Telegram-Init-Data"
    ] = initData;
  }

  if (options.authToken) {
    headers["Authorization"] =
      `Bearer ${options.authToken}`;
  }

  const requestOptions = {
    method:
      options.method || "GET",
    headers
  };

  if (
    options.body !==
    undefined
  ) {
    requestOptions.body =
      typeof options.body ===
      "string"
        ? options.body
        : JSON.stringify(
            options.body
          );
  }

  let response;

  try {

    response =
      await fetch(
        API_BASE + path,
        requestOptions
      );

  } catch (error) {

    throw new Error(
      "Network error. Please check your connection."
    );
  }

  const text =
    await response.text();

  let data = {};

  if (text) {

    try {

      data =
        JSON.parse(text);

    } catch {

      data = {
        message: text
      };
    }
  }

  if (!response.ok) {

    const message =
      data?.error ||
      data?.message ||
      `Request failed (${response.status})`;

    const error =
      new Error(message);

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data || {};
}


/* =========================================================
   INITIALIZATION
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initialize
);


async function initialize() {

  if (state.initialized) {
    return;
  }

  state.initialized = true;

  initTelegram();

  bindEvents();

  buildTicketGrid();

  buildMasterBoard();

  try {

    await loadEverything();

    hideLoading();

    startAutoRefresh();

  } catch (error) {

    console.error(error);

    hideLoading();

    handleInitialError(error);
  }
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  $("contactButton")?.addEventListener(
    "click",
    requestContact
  );

  $("joinButton")?.addEventListener(
    "click",
    joinGame
  );

  $("depositButton")?.addEventListener(
    "click",
    () =>
      openModal("depositModal")
  );

  $("withdrawButton")?.addEventListener(
    "click",
    openWithdraw
  );

  $("submitDepositButton")
    ?.addEventListener(
      "click",
      submitDeposit
    );

  $("submitWithdrawButton")
    ?.addEventListener(
      "click",
      submitWithdrawal
    );

  $("copyTelebirrButton")
    ?.addEventListener(
      "click",
      copyTelebirr
    );

  $("refreshButton")
    ?.addEventListener(
      "click",
      manualRefresh
    );

  $("retryButton")
    ?.addEventListener(
      "click",
      async () => {

        showLoading();

        try {

          await loadEverything();

          hideLoading();

          showToast(
            "✓",
            "Game refreshed"
          );

        } catch (error) {

          hideLoading();

          showFatalError(
            getErrorMessage(error)
          );
        }
      }
    );


  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      element => {

        element.addEventListener(
          "click",
          () => {

            closeModal(
              element.dataset
                .closeModal
            );
          }
        );
      }
    );


  $("depositAmount")
    ?.addEventListener(
      "input",
      () => {

        if ($("depositError")) {
          $("depositError")
            .textContent = "";
        }
      }
    );


  $("depositReference")
    ?.addEventListener(
      "input",
      () => {

        if ($("depositError")) {
          $("depositError")
            .textContent = "";
        }
      }
    );


  $("withdrawAmount")
    ?.addEventListener(
      "input",
      () => {

        if ($("withdrawError")) {
          $("withdrawError")
            .textContent = "";
        }
      }
    );


  $("withdrawPhone")
    ?.addEventListener(
      "input",
      () => {

        if ($("withdrawError")) {
          $("withdrawError")
            .textContent = "";
        }
      }
    );
}


/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadEverything() {

  await loadUser();

  /*
    IMPORTANT:
    contactVerified comes from the Worker/D1.
  */
  if (!state.contactVerified) {

    showAuth();

    return;
  }

  hideAuth();

  await Promise.all([
    loadGame(),
    loadRankings()
  ]);

  renderUser();
}


/* =========================================================
   USER
========================================================= */

async function loadUser() {

  const data =
    await api("/api/me");

  state.user =
    data.user ||
    data;


  /*
    First value comes from /api/me.
  */
  let verified =
    Boolean(
      state.user?.contact_verified ??
      state.user?.contactVerified
    );


  /*
    Then ALWAYS check /api/contact-status.

    This is the important fix that prevents the
    contact request from appearing repeatedly.
  */
  try {

    const contactStatus =
      await api(
        "/api/contact-status"
      );

    verified =
      Boolean(
        contactStatus?.contact_verified ??
        contactStatus?.contactVerified ??
        verified
      );


    if (contactStatus?.user) {

      state.user = {
        ...state.user,
        ...contactStatus.user
      };
    }


    if (
      contactStatus?.phone_number ||
      contactStatus?.phoneNumber
    ) {

      state.user.phone_number =
        contactStatus.phone_number ||
        contactStatus.phoneNumber;
    }

  } catch (error) {

    console.warn(
      "Contact status check:",
      error
    );
  }


  state.contactVerified =
    verified;


  renderUser();
}


function renderUser() {

  if (!state.user) {
    return;
  }

  const user =
    state.user;


  const firstName =
    user.first_name ||
    user.firstName ||
    user.username ||
    "Player";


  const username =
    user.username
      ? `@${String(
          user.username
        ).replace(
          /^@/,
          ""
        )}`
      : "Telegram Player";


  if ($("playerName")) {
    $("playerName")
      .textContent =
      firstName;
  }


  if ($("playerUsername")) {
    $("playerUsername")
      .textContent =
      username;
  }


  const avatarText =
    String(firstName)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(
        word =>
          word.charAt(0)
      )
      .join("")
      .toUpperCase();


  if ($("playerAvatar")) {
    $("playerAvatar")
      .textContent =
      avatarText || "EB";
  }


  const balance =
    Number(
      user.balance ??
      user.wallet_balance ??
      0
    );


  if ($("walletBalance")) {
    $("walletBalance")
      .textContent =
      money(balance);
  }


  if (
    $("withdrawAvailableBalance")
  ) {
    $("withdrawAvailableBalance")
      .textContent =
      money(balance);
  }
}


/* =========================================================
   CONTACT VERIFICATION
========================================================= */

async function requestContact() {

  const button =
    $("contactButton");


  /*
    NEVER ask again if D1 says verified.
  */
  if (state.contactVerified) {

    hideAuth();

    return;
  }


  /*
    Prevent double taps.
  */
  if (
    state.contactChecking
  ) {
    return;
  }


  state.contactChecking =
    true;


  setButtonLoading(
    button,
    "Checking..."
  );

  clearAuthMessages();


  try {

    /*
      Check the Worker before opening Telegram's
      contact dialog.
    */
    const status =
      await api(
        "/api/contact-status"
      );


    if (
      status?.contact_verified ||
      status?.contactVerified
    ) {

      state.contactVerified =
        true;


      if (status.user) {

        state.user = {
          ...state.user,
          ...status.user
        };
      }


      if (
        status.phone_number ||
        status.phoneNumber
      ) {

        state.user.phone_number =
          status.phone_number ||
          status.phoneNumber;
      }


      hideAuth();

      renderUser();

      await loadGame();

      await loadRankings();

      showToast(
        "✓",
        "Contact already verified"
      );


      resetButton(
        button,
        "Verify Contact"
      );


      return;
    }


    /*
      Telegram native contact request.
    */
    if (
      state.telegram &&
      typeof state.telegram
        .requestContact ===
        "function"
    ) {

      state.telegram.requestContact(
        async shared => {

          if (!shared) {

            state.contactChecking =
              false;

            resetButton(
              button,
              "Verify Contact"
            );

            showAuthError(
              "Contact sharing was cancelled."
            );

            return;
          }


          setButtonLoading(
            button,
            "Verifying..."
          );


          showAuthError(
            "Waiting for Telegram to verify your contact..."
          );


          /*
            IMPORTANT:

            The Telegram callback does not
            reliably provide the phone number.

            The bot webhook saves the contact
            into D1.

            We wait for D1 to report
            contact_verified = true.
          */
          const verified =
            await waitForContactVerification();


          if (verified) {

            state.contactVerified =
              true;


            hideAuth();

            renderUser();


            resetButton(
              button,
              "Verified ✓"
            );


            await loadGame();

            await loadRankings();


            showToast(
              "✓",
              "Contact verified"
            );

          } else {

            resetButton(
              button,
              "Verify Contact"
            );


            showAuthError(
              "Telegram did not confirm the contact yet. Please try again in a moment."
            );
          }


          state.contactChecking =
            false;
        }
      );

    } else {

      state.contactChecking =
        false;


      resetButton(
        button,
        "Verify Contact"
      );


      showAuthError(
        "Please open Ethiopia Bingo inside Telegram to verify your contact."
      );
    }

  } catch (error) {

    console.error(
      "Contact error:",
      error
    );


    state.contactChecking =
      false;


    resetButton(
      button,
      "Verify Contact"
    );


    showAuthError(
      getErrorMessage(error)
    );
  }
}


/*
  Wait for Telegram webhook -> Worker -> D1.

  Maximum:
  30 checks x 1 second = 30 seconds.
*/
async function waitForContactVerification() {

  const maxAttempts =
    30;


  for (
    let attempt = 0;
    attempt < maxAttempts;
    attempt++
  ) {

    try {

      const data =
        await api(
          "/api/contact-status"
        );


      const verified =
        Boolean(
          data?.contact_verified ??
          data?.contactVerified
        );


      if (verified) {

        state.contactVerified =
          true;


        if (data.user) {

          state.user = {
            ...state.user,
            ...data.user
          };
        }


        if (
          data.phone_number ||
          data.phoneNumber
        ) {

          state.user.phone_number =
            data.phone_number ||
            data.phoneNumber;
        }


        return true;
      }

    } catch (error) {

      console.warn(
        "Contact verification polling:",
        error
      );
    }


    await sleep(1000);
  }


  return false;
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


/*
  Compatibility function.

  IMPORTANT:
  We do NOT trust a phone number coming from
  browser JavaScript.

  The Telegram webhook is responsible for
  saving the verified contact.
*/
async function sendContactToServer() {

  const status =
    await api(
      "/api/contact-status"
    );


  if (
    status?.contact_verified ||
    status?.contactVerified
  ) {

    state.contactVerified =
      true;


    if (status.user) {

      state.user = {
        ...state.user,
        ...status.user
      };
    }


    renderUser();

    return true;
  }


  return false;
}


/* =========================================================
   GAME
========================================================= */

async function loadGame() {

  const data =
    await api("/api/game");


  state.game =
    data.game ||
    data;


  state.myTickets =
    data.my_tickets ||
    data.myTickets ||
    state.game?.my_tickets ||
    state.game?.myTickets ||
    [];


  state.calledNumbers =
    normalizeNumbers(
      data.called_numbers ||
      data.calledNumbers ||
      state.game?.called_numbers ||
      state.game?.calledNumbers ||
      []
    );


  renderGame();

  renderMyTickets();
}


function renderGame() {

  if (!state.game) {
    return;
  }


  const game =
    state.game;


  const status =
    game.status ||
    game.game_status ||
    "waiting";


  if ($("gameStatus")) {
    $("gameStatus")
      .textContent =
      formatGameStatus(
        status
      );
  }


  const timer =
    game.seconds_remaining ??
    game.remaining_seconds ??
    game.timer ??
    null;


  if (
    timer !== null &&
    timer !== undefined
  ) {

    if ($("gameTimer")) {

      $("gameTimer")
        .textContent =
        formatTimer(timer);
    }

  } else {

    if ($("gameTimer")) {

      $("gameTimer")
        .textContent =
        "--";
    }
  }


  const ticketPrice =
    Number(
      game.ticket_price ??
      CONFIG.TICKET_PRICE
    );


  if ($("ticketPrice")) {

    $("ticketPrice")
      .textContent =
      money(ticketPrice);
  }


  const prizePool =
    Number(
      game.prize_pool ??
      game.prizePool ??
      0
    );


  if ($("prizePool")) {

    $("prizePool")
      .textContent =
      money(prizePool);
  }


  const players =
    Number(
      game.player_count ??
      game.playerCount ??
      game.players_count ??
      game.playersCount ??
      0
    );


  if ($("playerCount")) {

    $("playerCount")
      .textContent =
      players;
  }


  renderCalledNumbers();

  renderMasterBoard();

  renderResult();
}


/* =========================================================
   TICKET GRID
========================================================= */

function buildTicketGrid() {

  const container =
    $("ticketGrid");


  if (!container) {
    return;
  }


  if (
    container.children.length ===
    CONFIG.TOTAL_TICKETS
  ) {
    return;
  }


  const fragment =
    document.createDocumentFragment();


  for (
    let number = 1;
    number <=
      CONFIG.TOTAL_TICKETS;
    number++
  ) {

    const button =
      document.createElement(
        "button"
      );


    button.type =
      "button";


    button.className =
      "ticket-button";


    button.textContent =
      number;


    button.dataset.ticket =
      String(number);


    button.addEventListener(
      "click",
      event => {

        event.preventDefault();

        event.stopPropagation();

        selectTicket(
          number,
          button
        );
      }
    );


    fragment.appendChild(
      button
    );
  }


  container.appendChild(
    fragment
  );
}


function selectTicket(
  number,
  button
) {

  if (
    state.selectedTickets
      .has(number)
  ) {

    state.selectedTickets
      .delete(number);


    button.classList.remove(
      "selected"
    );


    updateTicketSelectionUI();

    return;
  }


  if (
    state.selectedTickets.size >=
    CONFIG.MAX_TICKETS
  ) {

    showToast(
      "!",
      "Maximum 4 tickets allowed"
    );

    return;
  }


  state.selectedTickets.add(
    number
  );


  button.classList.add(
    "selected"
  );


  updateTicketSelectionUI();
}


function updateTicketSelectionUI() {

  const numbers =
    Array.from(
      state.selectedTickets
    ).sort(
      (a, b) =>
        a - b
    );


  const count =
    numbers.length;


  const cost =
    count *
    CONFIG.TICKET_PRICE;


  if ($("selectedTicketCount")) {

    $("selectedTicketCount")
      .textContent =
      count;
  }


  if ($("selectedTicketCost")) {

    $("selectedTicketCost")
      .textContent =
      money(cost);
  }


  if ($("joinButtonCost")) {

    $("joinButtonCost")
      .textContent =
      `${money(cost)} ETB`;
  }


  if (!count) {

    if ($("selectedTicketNumbers")) {

      $("selectedTicketNumbers")
        .textContent =
        "None";
    }


    if ($("joinMessage")) {

      $("joinMessage")
        .textContent =
        "Select at least one ticket.";
    }

  } else {

    if ($("selectedTicketNumbers")) {

      $("selectedTicketNumbers")
        .textContent =
        numbers.join(", ");
    }


    if ($("joinMessage")) {

      $("joinMessage")
        .textContent =
        `${count} ticket${
          count === 1
            ? ""
            : "s"
        } selected.`;
    }
  }


  if ($("joinButton")) {

    $("joinButton").disabled =
      count === 0;
  }
}


/* =========================================================
   JOIN GAME
========================================================= */

async function joinGame() {

  if (
    !state.contactVerified
  ) {

    showToast(
      "!",
      "Please verify your contact first."
    );

    showAuth();

    return;
  }


  if (
    state.selectedTickets.size ===
    0
  ) {

    showToast(
      "!",
      "Select at least one ticket"
    );

    return;
  }


  if (
    state.selectedTickets.size >
    CONFIG.MAX_TICKETS
  ) {

    showToast(
      "!",
      "Maximum 4 tickets allowed"
    );

    return;
  }


  const tickets =
    Array.from(
      state.selectedTickets
    ).sort(
      (a, b) =>
        a - b
    );


  const total =
    tickets.length *
    CONFIG.TICKET_PRICE;


  const balance =
    Number(
      state.user?.balance ??
      0
    );


  if (
    balance < total
  ) {

    showToast(
      "!",
      `Insufficient balance. Need ${money(
        total
      )} ETB`
    );


    openModal(
      "depositModal"
    );

    return;
  }


  const button =
    $("joinButton");


  setButtonLoading(
    button,
    "Joining..."
  );


  try {

    const data =
      await api(
        "/api/join",
        {
          method: "POST",

          body: {
            tickets: tickets,
            ticket_numbers:
              tickets
          }
        }
      );


    if (data.user) {

      state.user =
        data.user;
    }


    if (data.game) {

      state.game =
        data.game;
    }


    state.myTickets =
      data.my_tickets ||
      data.myTickets ||
      state.myTickets;


    state.selectedTickets
      .clear();


    clearTicketSelections();

    updateTicketSelectionUI();

    renderUser();

    renderMyTickets();

    await loadGame();


    showToast(
      "✓",
      "You joined the game"
    );

  } catch (error) {

    console.error(error);


    if ($("joinError")) {

      $("joinError")
        .textContent =
        getErrorMessage(error);
    }


    showToast(
      "!",
      getErrorMessage(error)
    );

  } finally {

    resetButton(
      button,
      "Join Game"
    );
  }
}


function clearTicketSelections() {

  document
    .querySelectorAll(
      ".ticket-button.selected"
    )
    .forEach(
      button => {

        button.classList.remove(
          "selected"
        );
      }
    );
}


/* =========================================================
   CALLED NUMBERS
========================================================= */

function renderCalledNumbers() {

  const numbers =
    state.calledNumbers ||
    [];


  const last =
    numbers.length
      ? numbers[
          numbers.length - 1
        ]
      : null;


  if ($("lastCalledNumber")) {

    $("lastCalledNumber")
      .textContent =
      last ?? "—";
  }


  if ($("drawProgress")) {

    $("drawProgress")
      .textContent =
      `${numbers.length} / ${CONFIG.TOTAL_DRAWS}`;
  }


  const container =
    $("calledNumbers");


  if (!container) {
    return;
  }


  container.innerHTML =
    "";


  numbers
    .slice()
    .reverse()
    .forEach(
      number => {

        const ball =
          document.createElement(
            "div"
          );


        ball.className =
          "called-ball";


        ball.textContent =
          number;


        container.appendChild(
          ball
        );
      }
    );
}


/* =========================================================
   MASTER BOARD
========================================================= */

function buildMasterBoard() {

  const container =
    $("masterBoard");


  if (!container) {
    return;
  }


  if (
    container.children.length ===
    75
  ) {
    return;
  }


  const fragment =
    document.createDocumentFragment();


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


    cell.dataset.number =
      String(number);


    cell.textContent =
      number;


    fragment.appendChild(
      cell
    );
  }


  container.appendChild(
    fragment
  );
}


function renderMasterBoard() {

  const called =
    new Set(
      state.calledNumbers
    );


  document
    .querySelectorAll(
      ".board-number"
    )
    .forEach(
      cell => {

        const number =
          Number(
            cell.dataset.number
          );


        cell.classList.toggle(
          "called",
          called.has(number)
        );
      }
    );
}


/* =========================================================
   MY TICKETS
========================================================= */

function renderMyTickets() {

  const container =
    $("myTickets");


  if (!container) {
    return;
  }


  const tickets =
    state.myTickets || [];


  if ($("myTicketCount")) {

    $("myTicketCount")
      .textContent =
      tickets.length;
  }


  container.innerHTML =
    "";


  if (!tickets.length) {

    container.innerHTML =
      `<div class="empty-state">
        No tickets joined yet.
      </div>`;


    return;
  }


  const called =
    new Set(
      state.calledNumbers
    );


  tickets.forEach(
    (ticket, index) => {

      const ticketNumber =
        ticket.ticket_number ??
        ticket.ticketNumber ??
        ticket.number ??
        index + 1;


      const card =
        getTicketCard(ticket);


      const wrapper =
        document.createElement(
          "div"
        );


      wrapper.className =
        "my-ticket";


      const title =
        document.createElement(
          "div"
        );


      title.className =
        "my-ticket-title";


      const titleLeft =
        document.createElement(
          "span"
        );


      titleLeft.textContent =
        `Ticket #${ticketNumber}`;


      const titleRight =
        document.createElement(
          "span"
        );


      const winning =
        isWinningTicket(
          ticket
        );


      titleRight.textContent =
        winning
          ? "🏆 BINGO"
          : "Active";


      if (winning) {

        titleRight.style.color =
          "var(--green)";
      }


      title.appendChild(
        titleLeft
      );


      title.appendChild(
        titleRight
      );


      const grid =
        document.createElement(
          "div"
        );


      grid.className =
        "ticket-card-grid";


      if (
        Array.isArray(card) &&
        card.length === 5
      ) {

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
              card?.[row]?.[col] ??
              "";


            const cell =
              document.createElement(
                "div"
              );


            cell.className =
              "card-cell";


            if (
              value === 0 ||
              value === "FREE" ||
              value === null ||
              value === ""
            ) {

              cell.classList.add(
                "free"
              );


              cell.textContent =
                "FREE";

            } else {

              cell.textContent =
                value;


              if (
                called.has(
                  Number(value)
                )
              ) {

                cell.classList.add(
                  "marked"
                );
              }
            }


            grid.appendChild(
              cell
            );
          }
        }

      } else {

        grid.innerHTML =
          `<div class="empty-state">
            Ticket card unavailable.
          </div>`;
      }


      wrapper.appendChild(
        title
      );


      wrapper.appendChild(
        grid
      );


      container.appendChild(
        wrapper
      );
    }
  );
}


function getTicketCard(ticket) {

  const possible = [
    ticket.card,
    ticket.grid,
    ticket.numbers,
    ticket.ticket
  ];


  for (
    const value of possible
  ) {

    if (
      Array.isArray(value)
    ) {

      if (
        value.length === 5 &&
        Array.isArray(
          value[0]
        )
      ) {

        return value;
      }


      if (
        value.length === 25
      ) {

        const rows = [];


        for (
          let i = 0;
          i < 25;
          i += 5
        ) {

          rows.push(
            value.slice(
              i,
              i + 5
            )
          );
        }


        return rows;
      }
    }
  }


  /*
    Fallback matching the deterministic
    Worker card generation.
  */
  const number =
    Number(
      ticket.ticket_number ??
      ticket.ticketNumber ??
      ticket.number ??
      0
    );


  if (number > 0) {

    return generateCard(
      number
    );
  }


  return null;
}


/* =========================================================
   DETERMINISTIC CARD
========================================================= */

function generateCard(
  ticketNumber
) {

  let seed =
    100000 +
    Number(ticketNumber);


  function random() {

    seed =
      (
        seed * 9301 +
        49297
      ) % 233280;


    return (
      seed / 233280
    );
  }


  const numbers = [];

  const used =
    new Set();


  while (
    numbers.length < 24
  ) {

    const value =
      Math.floor(
        random() * 75
      ) + 1;


    if (
      !used.has(value)
    ) {

      used.add(value);

      numbers.push(value);
    }
  }


  const grid = [];

  let index = 0;


  for (
    let row = 0;
    row < 5;
    row++
  ) {

    const current = [];


    for (
      let col = 0;
      col < 5;
      col++
    ) {

      if (
        row === 2 &&
        col === 2
      ) {

        current.push(0);

      } else {

        current.push(
          numbers[index++]
        );
      }
    }


    grid.push(
      current
    );
  }


  return grid;
}


/* =========================================================
   RANKINGS
========================================================= */

async function loadRankings() {

  try {

    const data =
      await api(
        "/api/rank"
      );


    const ranking =
      data.rank ||
      data.ranking ||
      data.players ||
      data.users ||
      [];


    renderRankings(
      ranking
    );

  } catch (error) {

    console.warn(
      "Ranking error:",
      error
    );


    if ($("rankingList")) {

      $("rankingList")
        .innerHTML =
        `<div class="empty-state">
          Rankings unavailable.
        </div>`;
    }
  }
}


function renderRankings(
  ranking
) {

  const container =
    $("rankingList");


  if (!container) {
    return;
  }


  container.innerHTML =
    "";


  if (
    !Array.isArray(
      ranking
    ) ||
    ranking.length === 0
  ) {

    container.innerHTML =
      `<div class="empty-state">
        No player statistics yet.
      </div>`;


    return;
  }


  ranking
    .slice(0, 20)
    .forEach(
      (player, index) => {

        const row =
          document.createElement(
            "div"
          );


        row.className =
          "rank-row";


        const position =
          document.createElement(
            "div"
          );


        position.className =
          "rank-number";


        position.textContent =
          index + 1;


        const avatar =
          document.createElement(
            "div"
          );


        avatar.className =
          "rank-avatar";


        const name =
          player.first_name ||
          player.firstName ||
          player.username ||
          "Player";


        avatar.textContent =
          initials(name);


        const playerName =
          document.createElement(
            "div"
          );


        playerName.className =
          "rank-name";


        playerName.textContent =
          name;


        const won =
          document.createElement(
            "div"
          );


        won.className =
          "rank-won";


        const totalWon =
          Number(
            player.total_won ??
            player.totalWon ??
            player.winnings ??
            0
          );


        won.textContent =
          `${money(
            totalWon
          )} ETB`;


        row.appendChild(
          position
        );


        row.appendChild(
          avatar
        );


        row.appendChild(
          playerName
        );


        row.appendChild(
          won
        );


        container.appendChild(
          row
        );
      }
    );
}


/* =========================================================
   RESULT
========================================================= */

function renderResult() {

  const game =
    state.game;


  if (!game) {
    return;
  }


  const status =
    String(
      game.status ||
      game.game_status ||
      ""
    ).toLowerCase();


  const finished =
    [
      "finished",
      "completed",
      "complete",
      "ended"
    ].includes(status);


  if (
    !$("resultSection")
  ) {
    return;
  }


  if (!finished) {

    $("resultSection")
      .classList.add(
        "hidden"
      );

    return;
  }


  $("resultSection")
    .classList.remove(
      "hidden"
    );


  const winner =
    game.winner ||
    game.winner_name ||
    game.winnerName;


  const prize =
    Number(
      game.winner_prize ??
      game.winnerPrize ??
      game.prize ??
      0
    );


  if ($("resultTitle")) {

    $("resultTitle")
      .textContent =
      winner
        ? `${winner} won!`
        : "Game Finished";
  }


  if ($("resultText")) {

    $("resultText")
      .textContent =
      winner
        ? "Congratulations to the winner."
        : "The game has ended.";
  }


  if ($("resultPrize")) {

    $("resultPrize")
      .textContent =
      money(prize);
  }
}


/* =========================================================
   DEPOSIT
========================================================= */

async function submitDeposit() {

  const amount =
    Number(
      $("depositAmount")?.value
    );


  const reference =
    (
      $("depositReference")
        ?.value || ""
    ).trim();


  if ($("depositError")) {

    $("depositError")
      .textContent =
      "";
  }


  if (
    !Number.isFinite(amount) ||
    amount < CONFIG.MIN_DEPOSIT
  ) {

    if ($("depositError")) {

      $("depositError")
        .textContent =
        `Minimum deposit is ${CONFIG.MIN_DEPOSIT} ETB.`;
    }

    return;
  }


  if (!reference) {

    if ($("depositError")) {

      $("depositError")
        .textContent =
        "Please enter the Telebirr transaction/reference code.";
    }

    return;
  }


  const button =
    $("submitDepositButton");


  setButtonLoading(
    button,
    "Submitting..."
  );


  try {

    await api(
      "/api/credit-request",
      {
        method: "POST",

        body: {
          amount: amount,

          reference_code:
            reference
        }
      }
    );


    closeModal(
      "depositModal"
    );


    if ($("depositAmount")) {
      $("depositAmount")
        .value = "";
    }


    if ($("depositReference")) {
      $("depositReference")
        .value = "";
    }


    showToast(
      "✓",
      "Deposit request submitted"
    );


    await loadUser();

  } catch (error) {

    console.error(error);


    if ($("depositError")) {

      $("depositError")
        .textContent =
        getErrorMessage(error);
    }

  } finally {

    resetButton(
      button,
      "Submit Deposit Request"
    );
  }
}


/* =========================================================
   WITHDRAWAL
========================================================= */

function openWithdraw() {

  const balance =
    Number(
      state.user?.balance ??
      0
    );


  if (
    $("withdrawAvailableBalance")
  ) {

    $("withdrawAvailableBalance")
      .textContent =
      money(balance);
  }


  if ($("withdrawError")) {

    $("withdrawError")
      .textContent =
      "";
  }


  openModal(
    "withdrawModal"
  );
}


async function submitWithdrawal() {

  const amount =
    Number(
      $("withdrawAmount")?.value
    );


  const phone =
    (
      $("withdrawPhone")
        ?.value || ""
    ).trim();


  if ($("withdrawError")) {

    $("withdrawError")
      .textContent =
      "";
  }


  const balance =
    Number(
      state.user?.balance ??
      0
    );


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    if ($("withdrawError")) {

      $("withdrawError")
        .textContent =
        "Enter a valid withdrawal amount.";
    }

    return;
  }


  if (
    amount > balance
  ) {

    if ($("withdrawError")) {

      $("withdrawError")
        .textContent =
        "Withdrawal amount is greater than your wallet balance.";
    }

    return;
  }


  if (
    !/^09\d{8}$/.test(
      phone
    )
  ) {

    if ($("withdrawError")) {

      $("withdrawError")
        .textContent =
        "Enter a valid Telebirr number, for example 0912345678.";
    }

    return;
  }


  const button =
    $("submitWithdrawButton");


  setButtonLoading(
    button,
    "Submitting..."
  );


  try {

    await api(
      "/api/withdrawal-request",
      {
        method: "POST",

        body: {
          amount: amount,

          phone_number:
            phone
        }
      }
    );


    closeModal(
      "withdrawModal"
    );


    if ($("withdrawAmount")) {
      $("withdrawAmount")
        .value = "";
    }


    if ($("withdrawPhone")) {
      $("withdrawPhone")
        .value = "";
    }


    showToast(
      "✓",
      "Withdrawal request submitted"
    );


    await loadUser();

  } catch (error) {

    console.error(error);


    if ($("withdrawError")) {

      $("withdrawError")
        .textContent =
        getErrorMessage(error);
    }

  } finally {

    resetButton(
      button,
      "Submit Withdrawal"
    );
  }
}


/* =========================================================
   TELEBIRR
========================================================= */

async function copyTelebirr() {

  const number =
    "0920384625";


  try {

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {

      await navigator.clipboard
        .writeText(number);


      showToast(
        "✓",
        "Telebirr number copied"
      );


      return;
    }

  } catch (error) {

    console.warn(
      error
    );
  }


  showToast(
    "!",
    number
  );
}


/* =========================================================
   MODALS
========================================================= */

function openModal(id) {

  const modal =
    $(id);


  if (!modal) {
    return;
  }


  modal.classList.remove(
    "hidden"
  );


  document.body.style.overflow =
    "hidden";
}


function closeModal(id) {

  const modal =
    $(id);


  if (!modal) {
    return;
  }


  modal.classList.add(
    "hidden"
  );


  document.body.style.overflow =
    "";
}


/* =========================================================
   REFRESH
========================================================= */

async function manualRefresh() {

  if (state.loading) {
    return;
  }


  const button =
    $("refreshButton");


  if (button) {

    button.style.transform =
      "rotate(180deg)";
  }


  try {

    await loadEverything();


    showToast(
      "✓",
      "Updated"
    );

  } catch (error) {

    showToast(
      "!",
      getErrorMessage(error)
    );

  } finally {

    if (button) {

      setTimeout(
        () => {

          button.style.transform =
            "";

        },
        350
      );
    }
  }
}


function startAutoRefresh() {

  if (
    state.refreshTimer
  ) {

    clearInterval(
      state.refreshTimer
    );
  }


  state.refreshTimer =
    setInterval(
      async () => {

        if (
          document.hidden ||
          state.loading
        ) {
          return;
        }


        try {

          /*
            Always refresh the user first.

            This means that if the user becomes verified,
            the app notices it automatically.
          */
          await loadUser();


          if (
            !state.contactVerified
          ) {
            return;
          }


          await loadGame();

        } catch (error) {

          console.warn(
            "Auto refresh:",
            error
          );
        }

      },
      CONFIG.REFRESH_MS
    );
}


/* =========================================================
   UI
========================================================= */

function showAuth() {

  if ($("authSection")) {

    $("authSection")
      .classList.remove(
        "hidden"
      );
  }


  if ($("gameSection")) {

    $("gameSection")
      .classList.add(
        "hidden"
      );
  }


  if ($("errorSection")) {

    $("errorSection")
      .classList.add(
        "hidden"
      );
  }
}


function hideAuth() {

  if ($("authSection")) {

    $("authSection")
      .classList.add(
        "hidden"
      );
  }


  if ($("gameSection")) {

    $("gameSection")
      .classList.remove(
        "hidden"
      );
  }


  if ($("errorSection")) {

    $("errorSection")
      .classList.add(
        "hidden"
      );
  }
}


function clearAuthMessages() {

  if ($("authMessage")) {

    $("authMessage")
      .textContent =
      "";
  }


  if ($("authError")) {

    $("authError")
      .textContent =
      "";
  }
}


function showAuthError(
  message
) {

  if ($("authError")) {

    $("authError")
      .textContent =
      message;
  }
}


function setConnection(
  text
) {

  const element =
    $("connectionStatus");


  if (element) {

    element.textContent =
      text;
  }
}


/* =========================================================
   LOADING
========================================================= */

function showLoading() {

  if ($("loadingScreen")) {

    $("loadingScreen")
      .classList.remove(
        "hidden"
      );
  }


  if ($("app")) {

    $("app")
      .classList.add(
        "hidden"
      );
  }
}


function hideLoading() {

  if ($("loadingScreen")) {

    $("loadingScreen")
      .classList.add(
        "hidden"
      );
  }


  if ($("app")) {

    $("app")
      .classList.remove(
        "hidden"
      );
  }
}


/* =========================================================
   INITIAL ERROR
========================================================= */

function handleInitialError(
  error
) {

  const message =
    getErrorMessage(
      error
    );


  const lower =
    message.toLowerCase();


  if (
    lower.includes("telegram") ||
    lower.includes("init") ||
    lower.includes("auth")
  ) {

    showAuth();


    showAuthError(
      "Please open Ethiopia Bingo from your Telegram Mini App."
    );


    return;
  }


  showFatalError(
    message
  );
}


function showFatalError(
  message
) {

  if ($("gameSection")) {

    $("gameSection")
      .classList.add(
        "hidden"
      );
  }


  if ($("authSection")) {

    $("authSection")
      .classList.add(
        "hidden"
      );
  }


  if ($("errorSection")) {

    $("errorSection")
      .classList.remove(
        "hidden"
      );
  }


  if ($("fatalError")) {

    $("fatalError")
      .textContent =
      message;
  }
}


/* =========================================================
   TOAST
========================================================= */

function showToast(
  icon,
  message
) {

  const toast =
    $("toast");


  if (!toast) {
    return;
  }


  if ($("toastIcon")) {

    $("toastIcon")
      .textContent =
      icon;
  }


  if ($("toastText")) {

    $("toastText")
      .textContent =
      message;
  }


  toast.classList.add(
    "show"
  );


  if (
    state.toastTimer
  ) {

    clearTimeout(
      state.toastTimer
    );
  }


  state.toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          "show"
        );

      },
      2800
    );
}


/* =========================================================
   BUTTON HELPERS
========================================================= */

function setButtonLoading(
  button,
  text
) {

  if (!button) {
    return;
  }


  /*
    Only save the original text the first time.

    This prevents a loading operation from
    overwriting the previous button text.
  */
  if (
    !button.dataset.originalText
  ) {

    button.dataset.originalText =
      button.innerHTML;
  }


  button.innerHTML =
    `<span>${escapeHtml(
      text
    )}</span>`;


  button.classList.add(
    "loading"
  );


  button.disabled =
    true;
}


function resetButton(
  button,
  fallbackText
) {

  if (!button) {
    return;
  }


  button.classList.remove(
    "loading"
  );


  button.disabled =
    false;


  button.innerHTML =
    button.dataset.originalText ||
    `<span>${escapeHtml(
      fallbackText
    )}</span>`;


  /*
    Clear it so the next operation can
    capture the current button content.
  */
  delete button.dataset
    .originalText;
}


/* =========================================================
   FORMATTING
========================================================= */

function money(value) {

  const number =
    Number(value);


  if (
    !Number.isFinite(
      number
    )
  ) {

    return "0.00";
  }


  return number.toFixed(
    2
  );
}


function formatTimer(
  seconds
) {

  const value =
    Math.max(
      0,
      Math.floor(
        Number(seconds) || 0
      )
    );


  if (value >= 60) {

    const minutes =
      Math.floor(
        value / 60
      );


    const secondsLeft =
      value % 60;


    return (
      `${minutes}:` +
      `${String(
        secondsLeft
      ).padStart(2, "0")}`
    );
  }


  return `${value}s`;
}


function formatGameStatus(
  status
) {

  const value =
    String(status)
      .toLowerCase();


  const map = {

    waiting:
      "Waiting for players",

    starting:
      "Starting soon",

    running:
      "Game in progress",

    playing:
      "Game in progress",

    finished:
      "Game finished",

    completed:
      "Game finished",

    complete:
      "Game finished",

    ended:
      "Game ended"
  };


  return (
    map[value] ||
    String(status)
      .replace(
        /_/g,
        " "
      )
      .replace(
        /\b\w/g,
        char =>
          char.toUpperCase()
      )
  );
}


/* =========================================================
   NUMBER HELPERS
========================================================= */

function normalizeNumbers(
  value
) {

  if (
    !Array.isArray(value)
  ) {

    return [];
  }


  return value
    .map(Number)
    .filter(
      number =>
        Number.isInteger(
          number
        ) &&
        number >= 1 &&
        number <= 75
    );
}


function initials(
  name
) {

  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      word =>
        word.charAt(0)
    )
    .join("")
    .toUpperCase() ||
    "P";
}


/* =========================================================
   WINNER
========================================================= */

function isWinningTicket(
  ticket
) {

  return Boolean(
    ticket?.winner ||
    ticket?.is_winner ||
    ticket?.isWinner
  );
}


/* =========================================================
   ERROR
========================================================= */

function getErrorMessage(
  error
) {

  if (!error) {

    return "Something went wrong.";
  }


  return (
    error.message ||
    "Something went wrong. Please try again."
  );
}


/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHtml(
  value
) {

  return String(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


/* =========================================================
   GLOBAL ERROR HANDLING
========================================================= */

window.addEventListener(
  "error",
  event => {

    console.error(
      "Frontend error:",
      event.error ||
      event.message
    );
  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "Unhandled promise:",
      event.reason
    );
  }
);
