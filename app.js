// ============================================================
// ETHIOPIA BINGO - COMPLETE app.js
// ============================================================

const API_BASE =
  "https://ethio-bingo.ketiolcj.workers.dev";

let tg = null;

let currentUser = null;
let currentGame = null;

let selectedTickets = new Set();

let lastDrawCount = 0;
let refreshTimer = null;
let contactTimer = null;


// ============================================================
// DOM HELPER
// ============================================================

function $(id) {
  return document.getElementById(id);
}


// ============================================================
// PAGE READY
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  startApp();
});


// ============================================================
// START APP
// ============================================================

async function startApp() {

  console.log("Ethiopia Bingo starting...");

  // Get Telegram WebApp
  tg =
    window.Telegram &&
    window.Telegram.WebApp
      ? window.Telegram.WebApp
      : null;

  if (!tg) {

    showAuthError(
      "Please open Ethiopia Bingo from Telegram."
    );

    return;
  }

  // Telegram initialization
  try {

    tg.ready();
    tg.expand();

    console.log(
      "Telegram WebApp initialized"
    );

    console.log(
      "initData available:",
      Boolean(tg.initData)
    );

  } catch (error) {

    console.error(
      "Telegram initialization error:",
      error
    );

    showAuthError(
      "Telegram could not be initialized."
    );

    return;
  }

  // Authentication data must exist
  if (!tg.initData) {

    showAuthError(
      "Telegram authentication is missing. Please close the Mini App and open Ethiopia Bingo again from Telegram."
    );

    return;
  }

  // Connect ALL buttons
  setupButtons();

  // Create 1-500 ticket selector
  createTicketGrid();

  updateSelectedTicketUI();

  // Load account
  await loadUser();

  // Start automatic game refresh
  startAutoRefresh();
}


// ============================================================
// BUTTON SETUP
// ============================================================

function setupButtons() {

  console.log("Setting up buttons...");

  const contactButton =
    $("contactButton");

  const joinButton =
    $("joinButton");

  const depositButton =
    $("depositButton");

  const withdrawButton =
    $("withdrawButton");


  // Contact
  if (contactButton) {

    contactButton.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        console.log(
          "Contact button clicked"
        );

        requestTelegramContact();
      }
    );
  }


  // Join
  if (joinButton) {

    joinButton.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        console.log(
          "Join button clicked"
        );

        joinGame();
      }
    );
  }


  // Deposit
  if (depositButton) {

    depositButton.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        console.log(
          "Deposit button clicked"
        );

        submitDeposit();
      }
    );
  }


  // Withdraw
  if (withdrawButton) {

    withdrawButton.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

        console.log(
          "Withdraw button clicked"
        );

        submitWithdrawal();
      }
    );
  }

  console.log(
    "Buttons ready:",
    {
      contact: Boolean(contactButton),
      join: Boolean(joinButton),
      deposit: Boolean(depositButton),
      withdraw: Boolean(withdrawButton)
    }
  );
}


// ============================================================
// TELEGRAM API REQUEST
// ============================================================

async function api(
  path,
  options = {}
) {

  if (!tg) {

    throw new Error(
      "Telegram WebApp is not available."
    );
  }

  if (!tg.initData) {

    throw new Error(
      "Telegram authentication is required."
    );
  }

  const headers = {
    ...(options.headers || {})
  };

  headers[
    "X-Telegram-Init-Data"
  ] = tg.initData;

  if (options.body) {

    headers[
      "Content-Type"
    ] =
      headers[
        "Content-Type"
      ] ||
      "application/json";
  }

  console.log(
    "API request:",
    path
  );

  const response =
    await fetch(
      API_BASE + path,
      {
        ...options,
        headers
      }
    );

  let data;

  try {

    data =
      await response.json();

  } catch {

    throw new Error(
      `Server error: ${response.status}`
    );
  }

  console.log(
    "API response:",
    path,
    data
  );

  if (
    !response.ok ||
    data.ok === false
  ) {

    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


// ============================================================
// LOAD USER
// ============================================================

async function loadUser() {

  try {

    const data =
      await api("/api/me");

    if (!data.user) {

      throw new Error(
        "User account could not be loaded."
      );
    }

    currentUser =
      data.user;

    updateUserUI();

    if (
      currentUser.contact_verified
    ) {

      showGameScreen();

      await loadGame();

      await loadRankings();

    } else {

      showContactScreen();
    }

  } catch (error) {

    console.error(
      "loadUser error:",
      error
    );

    showAuthError(
      error.message
    );
  }
}


// ============================================================
// UPDATE USER UI
// ============================================================

function updateUserUI() {

  if (!currentUser) {
    return;
  }

  const name =
    currentUser.first_name ||
    currentUser.username ||
    "Player";

  const playerName =
    $("playerName");

  if (playerName) {
    playerName.textContent =
      name;
  }

  const balance =
    $("balance");

  if (balance) {

    balance.textContent =
      `${Number(
        currentUser.balance || 0
      ).toFixed(2)} ETB`;
  }
}


// ============================================================
// AUTH ERROR
// ============================================================

function showAuthError(message) {

  console.error(
    "AUTH:",
    message
  );

  const authMessage =
    $("authMessage");

  if (authMessage) {
    authMessage.textContent =
      message;
  }

  const authError =
    $("authError");

  if (authError) {
    authError.textContent =
      message;
  }
}


// ============================================================
// SHOW CONTACT SCREEN
// ============================================================

function showContactScreen() {

  const authScreen =
    $("authScreen");

  const gameScreen =
    $("gameScreen");

  if (authScreen) {

    authScreen.classList.remove(
      "hidden"
    );
  }

  if (gameScreen) {

    gameScreen.classList.add(
      "hidden"
    );
  }

  const message =
    $("authMessage");

  if (message) {

    message.textContent =
      "Please share your Telegram contact before playing.";
  }

  const button =
    $("contactButton");

  if (button) {

    button.style.display =
      "block";

    button.disabled =
      false;

    button.textContent =
      "Share Telegram Contact";
  }
}


// ============================================================
// SHOW GAME SCREEN
// ============================================================

function showGameScreen() {

  const authScreen =
    $("authScreen");

  const gameScreen =
    $("gameScreen");

  if (authScreen) {

    authScreen.classList.add(
      "hidden"
    );
  }

  if (gameScreen) {

    gameScreen.classList.remove(
      "hidden"
    );
  }
}


// ============================================================
// TELEGRAM CONTACT
// ============================================================

function requestTelegramContact() {

  console.log(
    "Requesting Telegram contact..."
  );

  if (!tg) {

    showAuthError(
      "Telegram is not available."
    );

    return;
  }

  if (
    typeof tg.requestContact !==
    "function"
  ) {

    showAuthError(
      "Contact sharing is not available in this Telegram version."
    );

    return;
  }

  const button =
    $("contactButton");

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Waiting for contact...";
  }

  const message =
    $("authMessage");

  if (message) {

    message.textContent =
      "Please confirm your contact in Telegram...";
  }

  try {

    tg.requestContact(
      function(result) {

        console.log(
          "Telegram contact result:",
          result
        );

        if (result) {

          if (message) {

            message.textContent =
              "Contact received. Verifying...";
          }

          startContactPolling();

        } else {

          if (button) {

            button.disabled =
              false;

            button.textContent =
              "Share Telegram Contact";
          }

          if (message) {

            message.textContent =
              "Contact sharing was cancelled.";
          }
        }
      }
    );

  } catch (error) {

    console.error(
      "requestContact error:",
      error
    );

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Share Telegram Contact";
    }

    showAuthError(
      error.message ||
      "Could not request contact."
    );
  }
}


// ============================================================
// CONTACT POLLING
// ============================================================

function startContactPolling() {

  if (contactTimer) {

    clearInterval(
      contactTimer
    );
  }

  let attempts = 0;

  contactTimer =
    setInterval(
      async () => {

        attempts++;

        console.log(
          "Checking contact status:",
          attempts
        );

        try {

          const data =
            await api(
              "/api/contact-status"
            );

          console.log(
            "Contact status:",
            data
          );

          if (
            data.contact_verified
          ) {

            clearInterval(
              contactTimer
            );

            contactTimer =
              null;

            if (currentUser) {

              currentUser.contact_verified =
                true;

              currentUser.phone_number =
                data.phone_number;
            }

            showGameScreen();

            await loadUser();

            return;
          }

          if (attempts >= 30) {

            clearInterval(
              contactTimer
            );

            contactTimer =
              null;

            const button =
              $("contactButton");

            if (button) {

              button.disabled =
                false;

              button.textContent =
                "Share Telegram Contact";
            }

            const message =
              $("authMessage");

            if (message) {

              message.textContent =
                "Verification is taking longer than expected. Please close and reopen the Mini App from Telegram.";
            }
          }

        } catch (error) {

          console.error(
            "Contact status error:",
            error
          );

        }

      },
      2000
    );
}


// ============================================================
// CREATE 1-500 TICKET GRID
// ============================================================

function createTicketGrid() {

  const container =
    $("ticketGrid");

  if (!container) {

    console.error(
      "ticketGrid element not found."
    );

    return;
  }

  container.innerHTML = "";

  const fragment =
    document.createDocumentFragment();

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
      "ticket-button";

    button.dataset.ticket =
      String(number);

    button.textContent =
      String(number);

    button.addEventListener(
      "click",
      function(event) {

        event.preventDefault();

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

  console.log(
    "500 ticket buttons created."
  );
}


// ============================================================
// SELECT TICKET
// ============================================================

function selectTicket(
  number,
  button
) {

  if (
    selectedTickets.has(number)
  ) {

    selectedTickets.delete(
      number
    );

    button.classList.remove(
      "selected"
    );

  } else {

    if (
      selectedTickets.size >= 4
    ) {

      showMessage(
        "You can select a maximum of 4 tickets."
      );

      return;
    }

    selectedTickets.add(
      number
    );

    button.classList.add(
      "selected"
    );
  }

  updateSelectedTicketUI();
}


// ============================================================
// SELECTED TICKET UI
// ============================================================

function updateSelectedTicketUI() {

  const count =
    selectedTickets.size;

  const cost =
    count * 10;

  const countElement =
    $("selectedCount");

  if (countElement) {

    countElement.textContent =
      count;
  }

  const costElement =
    $("selectedCost");

  if (costElement) {

    costElement.textContent =
      `${cost} ETB`;
  }
}


// ============================================================
// JOIN GAME
// ============================================================

async function joinGame() {

  console.log(
    "Joining game..."
  );

  if (
    selectedTickets.size === 0
  ) {

    showMessage(
      "Please select at least one ticket."
    );

    return;
  }

  if (
    selectedTickets.size > 4
  ) {

    showMessage(
      "Maximum 4 tickets."
    );

    return;
  }

  const button =
    $("joinButton");

  if (button) {

    button.disabled =
      true;

    button.textContent =
      "Joining...";
  }

  try {

    const ticketNumbers =
      Array.from(
        selectedTickets
      ).sort(
        (a, b) => a - b
      );

    const data =
      await api(
        "/api/join",
        {
          method: "POST",
          body: JSON.stringify({
            ticket_numbers:
              ticketNumbers
          })
        }
      );

    console.log(
      "Join successful:",
      data
    );

    selectedTickets.clear();

    document
      .querySelectorAll(
        ".ticket-button.selected"
      )
      .forEach(
        element =>
          element.classList.remove(
            "selected"
          )
      );

    updateSelectedTicketUI();

    showMessage(
      `Successfully joined with ${ticketNumbers.length} ticket${ticketNumbers.length > 1 ? "s" : ""}.`
    );

    await loadUser();

  } catch (error) {

    console.error(
      "Join error:",
      error
    );

    showMessage(
      error.message
    );

  } finally {

    if (button) {

      button.disabled =
        false;

      button.textContent =
        "Join Game";
    }
  }
}


// ============================================================
// LOAD GAME
// ============================================================

async function loadGame() {

  try {

    const data =
      await api(
        "/api/game"
      );

    if (
      data.contact_required
    ) {

      showContactScreen();

      return;
    }

    currentGame =
      data.game;

    renderGame();

  } catch (error) {

    console.error(
      "Game loading error:",
      error
    );
  }
}


// ============================================================
// RENDER GAME
// ============================================================

function renderGame() {

  if (!currentGame) {
    return;
  }

  const status =
    $("gameStatus");

  if (status) {

    status.textContent =
      formatGameStatus(
        currentGame.status
      );
  }

  const prizePool =
    $("prizePool");

  if (prizePool) {

    prizePool.textContent =
      `${Number(
        currentGame.prize_pool || 0
      ).toFixed(2)} ETB`;
  }

  const playerCount =
    $("playerCount");

  if (playerCount) {

    playerCount.textContent =
      Number(
        currentGame.player_count || 0
      );
  }

  const ticketCount =
    $("ticketCount");

  if (ticketCount) {

    ticketCount.textContent =
      Number(
        currentGame.ticket_count || 0
      );
  }

  const called =
    currentGame.called_numbers || [];

  const drawCount =
    $("drawCount");

  if (drawCount) {

    drawCount.textContent =
      `${called.length} / 20`;
  }

  renderCalledNumbers(
    called
  );

  renderMyTickets(
    currentGame.tickets || []
  );
}


// ============================================================
// GAME STATUS
// ============================================================

function formatGameStatus(status) {

  switch (status) {

    case "waiting":
      return "Waiting";

    case "running":
      return "Live";

    case "finished":
      return "Finished";

    default:
      return status || "Waiting";
  }
}


// ============================================================
// CALLED NUMBERS
// ============================================================

function renderCalledNumbers(
  called
) {

  const container =
    $("calledNumbers");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  called.forEach(
    item => {

      const ball =
        document.createElement(
          "div"
        );

      ball.className =
        "number-ball";

      ball.textContent =
        String(item.number);

      container.appendChild(
        ball
      );
    }
  );

  // Play sound only when a new number appears.
  if (
    called.length > lastDrawCount
  ) {

    playBallSound();

    lastDrawCount =
      called.length;
  }
}


// ============================================================
// RENDER PLAYER TICKETS
// ============================================================

function renderMyTickets(
  tickets
) {

  const container =
    $("myTickets");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!tickets.length) {

    container.innerHTML = `
      <div class="card">
        <h3>Your Tickets</h3>
        <p>You have not joined this game yet.</p>
      </div>
    `;

    return;
  }

  const calledNumbers =
    new Set(
      (
        currentGame &&
        currentGame.called_numbers
          ? currentGame.called_numbers
          : []
      ).map(
        item =>
          Number(item.number)
      )
    );

  tickets.forEach(
    ticket => {

      const cardWrapper =
        document.createElement(
          "div"
        );

      cardWrapper.className =
        "card ticket-card";

      const heading =
        document.createElement(
          "h3"
        );

      heading.textContent =
        `Ticket #${ticket.ticket_number}`;

      cardWrapper.appendChild(
        heading
      );

      const bingo =
        document.createElement(
          "div"
        );

      bingo.className =
        "bingo-card";

      ticket.card.forEach(
        (row, rowIndex) => {

          row.forEach(
            (number, colIndex) => {

              const cell =
                document.createElement(
                  "div"
                );

              cell.className =
                "bingo-cell";

              // FREE CENTER
              if (
                rowIndex === 2 &&
                colIndex === 2
              ) {

                cell.textContent =
                  "FREE";

                cell.classList.add(
                  "free"
                );

              } else {

                cell.textContent =
                  String(number);

                if (
                  calledNumbers.has(
                    Number(number)
                  )
                ) {

                  cell.classList.add(
                    "called"
                  );
                }
              }

              bingo.appendChild(
                cell
              );
            }
          );
        }
      );

      cardWrapper.appendChild(
        bingo
      );

      container.appendChild(
        cardWrapper
      );
    }
  );
}


// ============================================================
// DEPOSIT
// ============================================================

async function submitDeposit() {

  console.log(
    "Deposit started."
  );

  let amount =
    window.prompt(
      "Enter deposit amount in ETB.\nMinimum: 50 ETB"
    );

  if (amount === null) {
    return;
  }

  amount =
    Number(
      amount.trim()
    );

  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

    showMessage(
      "Minimum deposit is 50 ETB."
    );

    return;
  }

  const reference =
    window.prompt(
      "Enter your Telebirr transaction/reference code:"
    );

  if (
    reference === null ||
    !reference.trim()
  ) {

    showMessage(
      "Transaction reference is required."
    );

    return;
  }

  try {

    const data =
      await api(
        "/api/credit-request",
        {
          method: "POST",
          body: JSON.stringify({
            amount: amount,
            reference_code:
              reference.trim()
          })
        }
      );

    showMessage(
      data.message ||
      "Deposit request submitted."
    );

  } catch (error) {

    console.error(
      "Deposit error:",
      error
    );

    showMessage(
      error.message
    );
  }
}


// ============================================================
// WITHDRAWAL
// ============================================================

async function submitWithdrawal() {

  console.log(
    "Withdrawal started."
  );

  let amount =
    window.prompt(
      "Enter withdrawal amount in ETB.\nMinimum: 10 ETB"
    );

  if (amount === null) {
    return;
  }

  amount =
    Number(
      amount.trim()
    );

  if (
    !Number.isFinite(amount) ||
    amount < 10
  ) {

    showMessage(
      "Minimum withdrawal is 10 ETB."
    );

    return;
  }

  const phone =
    window.prompt(
      "Enter your Telebirr phone number:"
    );

  if (
    phone === null ||
    !phone.trim()
  ) {

    showMessage(
      "Telebirr phone number is required."
    );

    return;
  }

  try {

    const data =
      await api(
        "/api/withdrawal-request",
        {
          method: "POST",
          body: JSON.stringify({
            amount: amount,
            phone_number:
              phone.trim()
          })
        }
      );

    showMessage(
      data.message ||
      "Withdrawal request submitted."
    );

  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );

    showMessage(
      error.message
    );
  }
}


// ============================================================
// RANKINGS
// ============================================================

async function loadRankings() {

  const container =
    $("rankings");

  if (!container) {
    return;
  }

  try {

    const data =
      await api(
        "/api/rank"
      );

    container.innerHTML = "";

    if (
      !data.rankings ||
      !data.rankings.length
    ) {

      container.textContent =
        "No winners yet.";

      return;
    }

    data.rankings.forEach(
      row => {

        const element =
          document.createElement(
            "div"
          );

        element.className =
          "ranking-row";

        const position =
          document.createElement(
            "span"
          );

        position.textContent =
          `#${row.rank}`;

        const name =
          document.createElement(
            "span"
          );

        name.textContent =
          row.first_name ||
          row.username ||
          "Player";

        const amount =
          document.createElement(
            "strong"
          );

        amount.textContent =
          `${Number(
            row.total_won || 0
          ).toFixed(2)} ETB`;

        element.appendChild(
          position
        );

        element.appendChild(
          name
        );

        element.appendChild(
          amount
        );

        container.appendChild(
          element
        );
      }
    );

  } catch (error) {

    console.error(
      "Rankings error:",
      error
    );

    container.textContent =
      "Unable to load rankings.";
  }
}


// ============================================================
// SOUND
// ============================================================

function playBallSound() {

  try {

    const AudioContext =
      window.AudioContext ||
      window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const audio =
      new AudioContext();

    const oscillator =
      audio.createOscillator();

    const gain =
      audio.createGain();

    oscillator.type =
      "sine";

    oscillator.frequency.value =
      650;

    gain.gain.setValueAtTime(
      0.001,
      audio.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.15,
      audio.currentTime + 0.02
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audio.currentTime + 0.18
    );

    oscillator.connect(
      gain
    );

    gain.connect(
      audio.destination
    );

    oscillator.start();

    oscillator.stop(
      audio.currentTime + 0.2
    );

  } catch (error) {

    console.log(
      "Sound unavailable."
    );
  }
}


// ============================================================
// MESSAGE
// ============================================================

function showMessage(message) {

  console.log(
    "MESSAGE:",
    message
  );

  // Telegram popup when available
  if (
    tg &&
    typeof tg.showPopup ===
      "function"
  ) {

    try {

      tg.showPopup(
        {
          title:
            "Ethiopia Bingo",
          message:
            String(message),
          buttons: [
            {
              type: "ok"
            }
          ]
        }
      );

      return;

    } catch {
      // Fall back below.
    }
  }

  window.alert(
    String(message)
  );
}


// ============================================================
// AUTO REFRESH
// ============================================================

function startAutoRefresh() {

  if (refreshTimer) {

    clearInterval(
      refreshTimer
    );
  }

  refreshTimer =
    setInterval(
      async () => {

        if (
          !currentUser ||
          !currentUser.contact_verified
        ) {
          return;
        }

        try {

          await loadGame();

          await loadUser();

        } catch (error) {

          console.error(
            "Automatic refresh:",
            error
          );
        }

      },
      5000
    );
}
