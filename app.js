const tg = window.Telegram?.WebApp;

const API_BASE =
  "https://ethio-bingo.ketiolcj.workers.dev";

let currentUser = null;
let currentGame = null;
let selectedTickets = [];


/* =========================================================
   TELEGRAM INITIALIZATION
========================================================= */

function initTelegram() {
  if (!tg) {
    showError(
      "Please open Ethiopia Bingo inside Telegram."
    );
    return false;
  }

  tg.ready();
  tg.expand();

  /*
   * Telegram Mini App authentication data.
   *
   * This MUST be sent to the Worker.
   */
  if (!tg.initData) {
    showError(
      "Telegram authentication data is missing. Please close the Mini App and open it again from Telegram."
    );
    return false;
  }

  return true;
}


/* =========================================================
   API REQUEST
========================================================= */

async function api(
  path,
  options = {}
) {

  if (!tg || !tg.initData) {
    throw new Error(
      "Telegram authentication is required"
    );
  }

  const headers = {
    "Content-Type": "application/json",

    /*
     * IMPORTANT:
     * This is what Cloudflare Worker validates.
     */
    "X-Telegram-Init-Data": tg.initData
  };

  /*
   * Preserve any additional headers.
   */
  if (options.headers) {
    Object.assign(
      headers,
      options.headers
    );
  }

  const response =
    await fetch(
      `${API_BASE}${path}`,
      {
        ...options,
        headers
      }
    );

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      `Server returned HTTP ${response.status}`
    );
  }

  if (!response.ok || data.ok === false) {

    throw new Error(
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}


/* =========================================================
   DOM HELPERS
========================================================= */

function $(id) {
  return document.getElementById(id);
}


function showError(message) {

  console.error(message);

  const element =
    $("errorMessage");

  if (element) {
    element.textContent =
      message;

    element.style.display =
      "block";
  }

  if (tg?.showAlert) {
    tg.showAlert(message);
  }
}


function hideError() {

  const element =
    $("errorMessage");

  if (element) {
    element.style.display =
      "none";
  }
}


function setText(
  id,
  value
) {

  const element =
    $(id);

  if (element) {
    element.textContent =
      value;
  }
}


/* =========================================================
   CONTACT VERIFICATION
========================================================= */

let contactPollTimer = null;


async function getContactStatus() {

  try {

    return await api(
      "/api/contact-status",
      {
        method: "GET"
      }
    );

  } catch (error) {

    console.error(
      "Contact status error:",
      error
    );

    return null;
  }
}


async function waitForContactVerification() {

  /*
   * Check immediately.
   */
  let status =
    await getContactStatus();

  if (
    status?.contact_verified === true
  ) {
    return true;
  }


  /*
   * Telegram webhook may need
   * a short time to reach Worker.
   */

  for (
    let attempt = 0;
    attempt < 15;
    attempt++
  ) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1000
        )
    );


    status =
      await getContactStatus();


    console.log(
      "Contact verification attempt:",
      attempt + 1,
      status
    );


    if (
      status?.contact_verified === true
    ) {

      return true;
    }
  }


  return false;
}


async function requestContact() {

  hideError();

  if (!tg) {

    showError(
      "Please open Ethiopia Bingo inside Telegram."
    );

    return;
  }


  if (!tg.initData) {

    showError(
      "Telegram authentication data is missing. Please reopen Ethiopia Bingo from Telegram."
    );

    return;
  }


  /*
   * Modern Telegram Mini App contact API.
   *
   * requestContact() returns whether the
   * request was successfully sent.
   */
  try {

    const sent =
      await tg.requestContact();


    console.log(
      "Telegram contact request result:",
      sent
    );


    if (!sent) {

      showError(
        "Contact sharing was cancelled."
      );

      return;
    }


    showLoading(
      "Verifying your contact..."
    );


    /*
     * The Telegram bot webhook now receives
     * the contact and updates D1.
     */
    const verified =
      await waitForContactVerification();


    hideLoading();


    if (!verified) {

      showError(
        "Your contact was shared, but Telegram verification is still pending. Please try again."
      );

      return;
    }


    await loadEverything();


  } catch (error) {

    hideLoading();

    console.error(
      "Contact request error:",
      error
    );


    showError(
      error?.message ||
      "Could not request your Telegram contact."
    );
  }
}


/* =========================================================
   USER
========================================================= */

async function loadUser() {

  const data =
    await api(
      "/api/me",
      {
        method: "GET"
      }
    );


  currentUser =
    data.user;


  updateUserUI();

  return currentUser;
}


function updateUserUI() {

  if (!currentUser) {
    return;
  }


  setText(
    "userName",
    currentUser.first_name ||
    currentUser.username ||
    "Player"
  );


  setText(
    "balance",
    `${Number(
      currentUser.balance || 0
    ).toFixed(2)} ETB`
  );


  setText(
    "walletBalance",
    `${Number(
      currentUser.balance || 0
    ).toFixed(2)} ETB`
  );


  const verified =
    Number(
      currentUser.contact_verified || 0
    ) === 1;


  const contactButton =
    $("contactButton");

  if (contactButton) {

    contactButton.style.display =
      verified
        ? "none"
        : "block";
  }
}


/* =========================================================
   GAME
========================================================= */

async function loadGame() {

  const data =
    await api(
      "/api/game",
      {
        method: "GET"
      }
    );


  currentGame =
    data.game;


  renderGame(
    data
  );


  return data;
}


function renderGame(data) {

  if (!data?.game) {
    return;
  }


  const game =
    data.game;


  setText(
    "gameStatus",
    formatGameStatus(
      game.status
    )
  );


  setText(
    "prizePool",
    `${Number(
      game.prize_pool || 0
    ).toFixed(2)} ETB`
  );


  setText(
    "drawCount",
    `${game.draw_count || 0}/${game.max_draws || 20}`
  );


  renderCalledNumbers(
    game.called_numbers || []
  );


  renderTickets(
    data.tickets || []
  );


  if (
    game.status === "finished" &&
    game.winner_user_id
  ) {

    if (
      String(game.winner_user_id) ===
      String(currentUser?.user_id)
    ) {

      showWinner(
        game.winner_prize
      );
    }
  }
}


function formatGameStatus(
  status
) {

  switch (status) {

    case "waiting":
      return "Waiting for players";

    case "running":
      return "Game in progress";

    case "finished":
      return "Game finished";

    default:
      return status || "Waiting";
  }
}


/* =========================================================
   CALLED NUMBERS
========================================================= */

function renderCalledNumbers(
  numbers
) {

  const container =
    $("calledNumbers");

  if (!container) {
    return;
  }


  container.innerHTML = "";


  numbers.forEach(
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
   TICKETS
========================================================= */

function renderTickets(
  tickets
) {

  const container =
    $("myTickets");

  if (!container) {
    return;
  }


  container.innerHTML = "";


  tickets.forEach(
    ticket => {

      const wrapper =
        document.createElement(
          "div"
        );

      wrapper.className =
        "ticket-card";


      const title =
        document.createElement(
          "div"
        );

      title.className =
        "ticket-title";

      title.textContent =
        `Ticket ${ticket.ticket_number}`;

      wrapper.appendChild(
        title
      );


      const grid =
        document.createElement(
          "div"
        );

      grid.className =
        "bingo-grid";


      const called =
        new Set(
          currentGame?.called_numbers
            ?.map(Number) || []
        );


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
                  number;

                if (
                  called.has(
                    Number(number)
                  )
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
          );
        }
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


/* =========================================================
   TICKET SELECTION
========================================================= */

async function joinGame() {

  hideError();


  if (
    selectedTickets.length < 1
  ) {

    showError(
      "Please select at least one ticket."
    );

    return;
  }


  if (
    selectedTickets.length > 4
  ) {

    showError(
      "You can select a maximum of 4 tickets."
    );

    return;
  }


  const total =
    selectedTickets.length * 10;


  if (
    Number(currentUser?.balance || 0) <
    total
  ) {

    showError(
      "Insufficient wallet balance."
    );

    return;
  }


  try {

    showLoading(
      "Joining game..."
    );


    await api(
      "/api/join",
      {
        method: "POST",
        body: JSON.stringify({
          ticket_numbers:
            selectedTickets
        })
      }
    );


    selectedTickets = [];


    hideLoading();


    await loadUser();
    await loadGame();


  } catch (error) {

    hideLoading();

    showError(
      error?.message ||
      "Could not join the game."
    );
  }
}


/* =========================================================
   DEPOSIT
========================================================= */

async function submitDeposit() {

  hideError();


  const amount =
    Number(
      $("depositAmount")?.value
    );


  const reference =
    String(
      $("depositReference")?.value ||
      ""
    ).trim();


  if (
    !Number.isFinite(amount) ||
    amount < 50
  ) {

    showError(
      "Minimum deposit is 50 ETB."
    );

    return;
  }


  if (!reference) {

    showError(
      "Please enter your Telebirr transaction/reference code."
    );

    return;
  }


  try {

    showLoading(
      "Submitting deposit..."
    );


    await api(
      "/api/credit-request",
      {
        method: "POST",
        body: JSON.stringify({
          amount: Math.floor(amount),
          reference_code:
            reference
        })
      }
    );


    hideLoading();


    if (
      $("depositAmount")
    ) {
      $("depositAmount").value =
        "";
    }


    if (
      $("depositReference")
    ) {
      $("depositReference").value =
        "";
    }


    showSuccess(
      "Deposit submitted. Please wait for admin approval."
    );


  } catch (error) {

    hideLoading();

    showError(
      error?.message ||
      "Deposit request failed."
    );
  }
}


/* =========================================================
   WITHDRAWAL
========================================================= */

async function submitWithdrawal() {

  hideError();


  const amount =
    Number(
      $("withdrawAmount")?.value
    );


  const phone =
    String(
      $("withdrawPhone")?.value ||
      ""
    ).trim();


  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    showError(
      "Enter a valid withdrawal amount."
    );

    return;
  }


  if (!phone) {

    showError(
      "Enter your Telebirr phone number."
    );

    return;
  }


  if (
    amount >
    Number(currentUser?.balance || 0)
  ) {

    showError(
      "Insufficient wallet balance."
    );

    return;
  }


  try {

    showLoading(
      "Submitting withdrawal..."
    );


    await api(
      "/api/withdrawal-request",
      {
        method: "POST",
        body: JSON.stringify({
          amount: Math.floor(amount),
          phone_number:
            phone
        })
      }
    );


    hideLoading();


    if (
      $("withdrawAmount")
    ) {
      $("withdrawAmount").value =
        "";
    }


    if (
      $("withdrawPhone")
    ) {
      $("withdrawPhone").value =
        "";
    }


    await loadUser();


    showSuccess(
      "Withdrawal submitted. Please wait for admin approval."
    );


  } catch (error) {

    hideLoading();

    showError(
      error?.message ||
      "Withdrawal request failed."
    );
  }
}


/* =========================================================
   RANKING
========================================================= */

async function loadRank() {

  try {

    const data =
      await api(
        "/api/rank",
        {
          method: "GET"
        }
      );


    renderRank(
      data.players || []
    );

  } catch (error) {

    console.error(
      "Rank error:",
      error
    );
  }
}


function renderRank(
  players
) {

  const container =
    $("rankList");

  if (!container) {
    return;
  }


  container.innerHTML = "";


  players.forEach(
    (player, index) => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "rank-row";


      row.innerHTML = `
        <span>${index + 1}</span>
        <span>${escapeHtml(
          player.first_name ||
          player.username ||
          "Player"
        )}</span>
        <span>${Number(
          player.total_won || 0
        ).toFixed(2)} ETB</span>
      `;


      container.appendChild(
        row
      );
    }
  );
}


/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadEverything() {

  try {

    showLoading(
      "Loading Ethiopia Bingo..."
    );


    await loadUser();


    /*
     * If contact is not verified,
     * show contact screen.
     */

    if (
      Number(
        currentUser?.contact_verified || 0
      ) !== 1
    ) {

      hideLoading();

      showContactScreen();

      return;
    }


    showGameScreen();


    await loadGame();
    await loadRank();


    hideLoading();


  } catch (error) {

    hideLoading();

    console.error(
      "Loading error:",
      error
    );


    if (
      String(
        error?.message || ""
      ).toLowerCase().includes(
        "telegram authentication"
      )
    ) {

      showError(
        "Telegram authentication is missing. Close this Mini App and open Ethiopia Bingo again from your Telegram bot."
      );

    } else {

      showError(
        error?.message ||
        "Could not load Ethiopia Bingo."
      );
    }
  }
}


/* =========================================================
   CONTACT / GAME SCREENS
========================================================= */

function showContactScreen() {

  const contactScreen =
    $("contactScreen");

  const gameScreen =
    $("gameScreen");

  if (contactScreen) {
    contactScreen.style.display =
      "block";
  }

  if (gameScreen) {
    gameScreen.style.display =
      "none";
  }
}


function showGameScreen() {

  const contactScreen =
    $("contactScreen");

  const gameScreen =
    $("gameScreen");

  if (contactScreen) {
    contactScreen.style.display =
      "none";
  }

  if (gameScreen) {
    gameScreen.style.display =
      "block";
  }
}


/* =========================================================
   UI FEEDBACK
========================================================= */

function showLoading(
  message
) {

  const element =
    $("loadingMessage");

  if (element) {

    element.textContent =
      message ||
      "Loading...";

    element.style.display =
      "block";
  }
}


function hideLoading() {

  const element =
    $("loadingMessage");

  if (element) {
    element.style.display =
      "none";
  }
}


function showSuccess(
  message
) {

  const element =
    $("successMessage");

  if (element) {

    element.textContent =
      message;

    element.style.display =
      "block";
  }

  if (tg?.showAlert) {
    tg.showAlert(message);
  }
}


function showWinner(
  prize
) {

  const message =
    `🎉 BINGO! You won ${Number(
      prize || 0
    ).toFixed(2)} ETB!`;

  showSuccess(message);
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
  value
) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* =========================================================
   BUTTON EVENTS
========================================================= */

function setupEvents() {

  /*
   * Contact
   */

  const contactButton =
    $("contactButton");

  if (contactButton) {

    contactButton.addEventListener(
      "click",
      requestContact
    );
  }


  /*
   * Join
   */

  const joinButton =
    $("joinButton");

  if (joinButton) {

    joinButton.addEventListener(
      "click",
      joinGame
    );
  }


  /*
   * Deposit
   */

  const depositButton =
    $("depositButton");

  if (depositButton) {

    depositButton.addEventListener(
      "click",
      submitDeposit
    );
  }


  /*
   * Withdrawal
   */

  const withdrawButton =
    $("withdrawButton");

  if (withdrawButton) {

    withdrawButton.addEventListener(
      "click",
      submitWithdrawal
    );
  }


  /*
   * Ticket buttons.
   *
   * This supports buttons with:
   * data-ticket="123"
   */

  document.addEventListener(
    "click",
    event => {

      const target =
        event.target.closest(
          "[data-ticket]"
        );

      if (!target) {
        return;
      }


      const ticketNumber =
        Number(
          target.dataset.ticket
        );


      if (
        !Number.isInteger(
          ticketNumber
        )
      ) {
        return;
      }


      toggleTicket(
        ticketNumber,
        target
      );
    }
  );
}


/* =========================================================
   TICKET TOGGLE
========================================================= */

function toggleTicket(
  ticketNumber,
  element
) {

  const index =
    selectedTickets.indexOf(
      ticketNumber
    );


  if (index >= 0) {

    selectedTickets.splice(
      index,
      1
    );

    element.classList.remove(
      "selected"
    );

    updateSelectedTicketUI();

    return;
  }


  if (
    selectedTickets.length >= 4
  ) {

    showError(
      "You can select a maximum of 4 tickets."
    );

    return;
  }


  selectedTickets.push(
    ticketNumber
  );


  element.classList.add(
    "selected"
  );


  updateSelectedTicketUI();
}


function updateSelectedTicketUI() {

  setText(
    "selectedCount",
    selectedTickets.length
  );


  setText(
    "selectedCost",
    `${selectedTickets.length * 10} ETB`
  );
}


/* =========================================================
   AUTO REFRESH
========================================================= */

let refreshTimer = null;


function startAutoRefresh() {

  if (refreshTimer) {
    clearInterval(
      refreshTimer
    );
  }


  refreshTimer =
    setInterval(
      async () => {

        try {

          /*
           * Do not refresh if Telegram
           * authentication disappeared.
           */

          if (
            !tg?.initData
          ) {
            return;
          }


          await loadUser();


          if (
            Number(
              currentUser?.contact_verified || 0
            ) === 1
          ) {

            await loadGame();
          }

        } catch (error) {

          console.error(
            "Auto refresh error:",
            error
          );
        }

      },
      3000
    );
}


/* =========================================================
   APP START
========================================================= */

async function startApp() {

  console.log(
    "Ethiopia Bingo starting..."
  );


  /*
   * This is critical.
   */

  if (!initTelegram()) {
    return;
  }


  setupEvents();


  /*
   * Listen for Telegram contact
   * event when available.
   */

  if (
    typeof tg.onEvent ===
    "function"
  ) {

    tg.onEvent(
      "contactRequested",
      event => {

        console.log(
          "Telegram contactRequested:",
          event
        );
      }
    );
  }


  /*
   * Load authenticated user.
   */

  await loadEverything();


  startAutoRefresh();
}


/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    startApp
  );

} else {

  startApp();
}
