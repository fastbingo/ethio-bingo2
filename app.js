const API_BASE = "https://ethio-bingo.ketiolcj.workers.dev";

let tg = null;
let currentUser = null;
let currentGame = null;

let selectedTickets = new Set();
let refreshTimer = null;
let contactTimer = null;

const MAX_TICKETS = 4;
const TICKET_PRICE = 10;


/* =========================================================
   START
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    startApp();
});


async function startApp() {

    try {

        tg = window.Telegram && window.Telegram.WebApp
            ? window.Telegram.WebApp
            : null;

        if (tg) {
            tg.ready();
            tg.expand();

            try {
                tg.setHeaderColor("#0b1020");
                tg.setBackgroundColor("#0b1020");
            } catch (e) {}
        }

        setupButtons();

        showLoading("Connecting to Telegram...");

        if (!tg || !tg.initData) {

            showAuthError(
                "Please open Ethiopia Bingo from Telegram. Telegram authentication is required."
            );

            return;
        }

        await loadUser();

        hideLoading();

        startAutoRefresh();

    } catch (error) {

        console.error("START ERROR:", error);

        hideLoading();

        showErrorScreen(
            error.message || "Unable to start the application."
        );
    }
}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

    const contactButton = document.getElementById("contactButton");
    const joinButton = document.getElementById("joinButton");
    const depositButton = document.getElementById("depositButton");
    const withdrawButton = document.getElementById("withdrawButton");
    const retryButton = document.getElementById("retryButton");

    if (contactButton) {
        contactButton.addEventListener("click", requestContact);
    }

    if (joinButton) {
        joinButton.addEventListener("click", joinGame);
    }

    if (depositButton) {
        depositButton.addEventListener("click", requestDeposit);
    }

    if (withdrawButton) {
        withdrawButton.addEventListener("click", requestWithdrawal);
    }

    if (retryButton) {
        retryButton.addEventListener("click", () => {
            location.reload();
        });
    }

    console.log("Buttons ready:", {
        contact: !!contactButton,
        join: !!joinButton,
        deposit: !!depositButton,
        withdraw: !!withdrawButton
    });
}


/* =========================================================
   API
========================================================= */

async function api(path, options = {}) {

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (tg && tg.initData) {
        headers["X-Telegram-Init-Data"] = tg.initData;
    }

    const response = await fetch(API_BASE + path, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch (e) {
        data = {};
    }

    if (!response.ok) {

        throw new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}


/* =========================================================
   USER
========================================================= */

async function loadUser() {

    try {

        const data = await api("/api/me");

        currentUser = data.user || data;

        renderUser();

        if (currentUser.contact_verified) {

            showGame();

            await loadGame();
            await loadRankings();

        } else {

            showContactScreen();

            startContactPolling();
        }

    } catch (error) {

        console.error("LOAD USER ERROR:", error);

        if (
            error.message.toLowerCase().includes("telegram") ||
            error.message.toLowerCase().includes("authentic")
        ) {

            showAuthError(
                "Telegram authentication is required. Close the Mini App and open it again from Telegram."
            );

            hideLoading();

            return;
        }

        throw error;
    }
}


/* =========================================================
   USER UI
========================================================= */

function renderUser() {

    if (!currentUser) return;

    const balance = Number(currentUser.balance || 0);

    const balanceElement =
        document.getElementById("walletBalance");

    if (balanceElement) {
        balanceElement.textContent = balance.toFixed(2);
    }

    const nameElement =
        document.getElementById("playerName");

    if (nameElement) {

        const name =
            currentUser.first_name ||
            currentUser.username ||
            "Player";

        nameElement.textContent = name;
    }

    const usernameElement =
        document.getElementById("playerUsername");

    if (usernameElement) {

        usernameElement.textContent =
            currentUser.username
                ? "@" + currentUser.username
                : "Telegram Player";
    }

    const avatar =
        document.getElementById("playerAvatar");

    if (avatar) {
        avatar.textContent = "👤";
    }
}


/* =========================================================
   CONTACT
========================================================= */

function requestContact() {

    if (!tg) {

        showAuthError(
            "Telegram Mini App is not available."
        );

        return;
    }

    if (typeof tg.requestContact !== "function") {

        showAuthError(
            "Your Telegram version does not support contact sharing."
        );

        return;
    }

    const button =
        document.getElementById("contactButton");

    if (button) {
        button.disabled = true;
        button.textContent = "Requesting contact...";
    }

    try {

        tg.requestContact(async (shared) => {

            console.log("Contact response:", shared);

            if (!shared) {

                if (button) {
                    button.disabled = false;
                    button.textContent =
                        "📱 Share Telegram Contact";
                }

                showAuthError(
                    "Contact sharing was cancelled."
                );

                return;
            }

            try {

                showAuthMessage(
                    "Contact shared. Verifying..."
                );

                await api("/api/contact", {
                    method: "POST",
                    body: JSON.stringify({
                        shared: true
                    })
                });

                showAuthMessage(
                    "Contact verified. Loading game..."
                );

                await loadUser();

            } catch (error) {

                console.error(
                    "CONTACT ERROR:",
                    error
                );

                showAuthError(
                    error.message
                );
            }

        });

    } catch (error) {

        console.error(
            "REQUEST CONTACT ERROR:",
            error
        );

        if (button) {
            button.disabled = false;
            button.textContent =
                "📱 Share Telegram Contact";
        }

        showAuthError(
            error.message ||
            "Unable to request contact."
        );
    }
}


/* =========================================================
   CONTACT POLLING
========================================================= */

function startContactPolling() {

    if (contactTimer) {
        clearInterval(contactTimer);
    }

    contactTimer = setInterval(async () => {

        try {

            const data =
                await api("/api/contact-status");

            if (
                data.contact_verified ||
                data.verified ||
                data.user?.contact_verified
            ) {

                clearInterval(contactTimer);
                contactTimer = null;

                await loadUser();
            }

        } catch (error) {

            console.log(
                "Contact check:",
                error.message
            );
        }

    }, 3000);
}


/* =========================================================
   GAME
========================================================= */

async function loadGame() {

    const data = await api("/api/game");

    currentGame =
        data.game ||
        data;

    renderGame(currentGame);
}


function renderGame(game) {

    if (!game) return;

    console.log("GAME:", game);

    const status =
        game.status ||
        game.state ||
        "waiting";

    const statusElement =
        document.getElementById("gameStatus");

    if (statusElement) {

        statusElement.textContent =
            formatGameStatus(status);
    }

    const timer =
        document.getElementById("gameTimer");

    if (timer) {

        if (
            game.seconds_remaining !== undefined &&
            game.seconds_remaining !== null
        ) {

            timer.textContent =
                Math.max(
                    0,
                    Number(game.seconds_remaining)
                ) + "s";

        } else {

            timer.textContent = "--";
        }
    }

    const price =
        Number(
            game.ticket_price ||
            game.ticketPrice ||
            TICKET_PRICE
        );

    const priceElement =
        document.getElementById("ticketPrice");

    if (priceElement) {
        priceElement.textContent = price;
    }

    const pool =
        Number(
            game.prize_pool ||
            game.prizePool ||
            0
        );

    const poolElement =
        document.getElementById("prizePool");

    if (poolElement) {
        poolElement.textContent =
            pool.toFixed(2);
    }

    const players =
        Number(
            game.player_count ||
            game.players_count ||
            game.players ||
            0
        );

    const playerCountElement =
        document.getElementById("playerCount");

    if (playerCountElement) {
        playerCountElement.textContent = players;
    }

    renderCalledNumbers(
        game.called_numbers ||
        game.calledNumbers ||
        []
    );

    renderMyTickets(
        game.my_tickets ||
        game.tickets ||
        []
    );
}


/* =========================================================
   TICKET GRID
========================================================= */

function createTicketGrid() {

    const grid =
        document.getElementById("ticketGrid");

    if (!grid) {

        console.error(
            "ticketGrid element was not found."
        );

        return;
    }

    grid.innerHTML = "";

    /*
       IMPORTANT:
       We create all 500 buttons here.
    */

    for (let number = 1; number <= 500; number++) {

        const button =
            document.createElement("button");

        button.type = "button";

        button.className =
            "ticket-number";

        button.dataset.ticket =
            String(number);

        button.textContent =
            String(number);

        /*
           DIRECT CLICK HANDLER
           This avoids event delegation problems.
        */

        button.addEventListener(
            "click",
            function () {

                selectTicket(number, button);
            }
        );

        grid.appendChild(button);
    }

    updateTicketSelectionUI();

    console.log(
        "Created 500 ticket buttons."
    );
}


/* =========================================================
   SELECT TICKET
========================================================= */

function selectTicket(number, button) {

    number = Number(number);

    console.log(
        "Ticket clicked:",
        number
    );

    if (!Number.isInteger(number)) {
        return;
    }

    /*
       If already selected,
       remove it.
    */

    if (selectedTickets.has(number)) {

        selectedTickets.delete(number);

        if (button) {
            button.classList.remove(
                "selected"
            );
        }

        updateTicketSelectionUI();

        return;
    }

    /*
       Maximum 4 tickets.
    */

    if (
        selectedTickets.size >=
        MAX_TICKETS
    ) {

        showNotification(
            "You can select a maximum of 4 tickets."
        );

        return;
    }

    /*
       Add ticket.
    */

    selectedTickets.add(number);

    if (button) {
        button.classList.add("selected");
    }

    updateTicketSelectionUI();

    /*
       Telegram vibration.
    */

    try {

        if (
            tg &&
            tg.HapticFeedback
        ) {

            tg.HapticFeedback
                .selectionChanged();
        }

    } catch (e) {}
}


/* =========================================================
   UPDATE TICKET UI
========================================================= */

function updateTicketSelectionUI() {

    const count =
        selectedTickets.size;

    const total =
        count * TICKET_PRICE;

    const countElement =
        document.getElementById(
            "selectedTicketCount"
        );

    if (countElement) {
        countElement.textContent =
            count;
    }

    const costElement =
        document.getElementById(
            "selectedTicketCost"
        );

    if (costElement) {
        costElement.textContent =
            total.toFixed(0);
    }

    /*
       Keep visual state correct.
       This also survives refreshes.
    */

    const buttons =
        document.querySelectorAll(
            ".ticket-number"
        );

    buttons.forEach(button => {

        const number =
            Number(
                button.dataset.ticket
            );

        if (
            selectedTickets.has(number)
        ) {

            button.classList.add(
                "selected"
            );

        } else {

            button.classList.remove(
                "selected"
            );
        }
    });

    const joinButton =
        document.getElementById(
            "joinButton"
        );

    if (joinButton) {

        if (count === 0) {

            joinButton.disabled = true;

            joinButton.textContent =
                "🎟️ Select Tickets";

        } else {

            joinButton.disabled = false;

            joinButton.textContent =
                `🎟️ Join Game • ${total} ETB`;
        }
    }
}


/* =========================================================
   JOIN GAME
========================================================= */

async function joinGame() {

    if (selectedTickets.size < 1) {

        showNotification(
            "Please select at least 1 ticket."
        );

        return;
    }

    if (selectedTickets.size > 4) {

        showNotification(
            "You can select a maximum of 4 tickets."
        );

        return;
    }

    const tickets =
        Array.from(selectedTickets)
            .map(Number)
            .sort((a, b) => a - b);

    const totalCost =
        tickets.length * TICKET_PRICE;

    if (
        currentUser &&
        Number(currentUser.balance || 0) <
        totalCost
    ) {

        showNotification(
            "Insufficient wallet balance."
        );

        return;
    }

    const button =
        document.getElementById(
            "joinButton"
        );

    if (button) {

        button.disabled = true;

        button.textContent =
            "Joining...";
    }

    try {

        const data =
            await api("/api/join", {
                method: "POST",

                body: JSON.stringify({
                    tickets: tickets,
                    ticket_numbers: tickets
                })
            });

        console.log(
            "JOIN RESPONSE:",
            data
        );

        selectedTickets.clear();

        updateTicketSelectionUI();

        showJoinMessage(
            "Successfully joined the game!"
        );

        showNotification(
            "Tickets successfully purchased."
        );

        await loadUser();
        await loadGame();

    } catch (error) {

        console.error(
            "JOIN ERROR:",
            error
        );

        showJoinError(
            error.message
        );

        if (button) {
            button.disabled = false;
        }

        updateTicketSelectionUI();
    }
}


/* =========================================================
   CALLED NUMBERS
========================================================= */

function renderCalledNumbers(numbers) {

    if (!Array.isArray(numbers)) {
        numbers = [];
    }

    const last =
        document.getElementById(
            "lastCalledNumber"
        );

    if (last) {

        last.textContent =
            numbers.length
                ? numbers[numbers.length - 1]
                : "—";
    }

    const progress =
        document.getElementById(
            "drawProgress"
        );

    if (progress) {

        progress.textContent =
            `${numbers.length} / 20 numbers`;
    }

    const board =
        document.getElementById(
            "masterBoard"
        );

    if (!board) return;

    board.innerHTML = "";

    for (
        let number = 1;
        number <= 75;
        number++
    ) {

        const cell =
            document.createElement("div");

        cell.className =
            "master-number";

        cell.textContent =
            number;

        if (
            numbers.includes(number)
        ) {

            cell.classList.add(
                "called"
            );
        }

        board.appendChild(cell);
    }
}


/* =========================================================
   MY TICKETS
========================================================= */

function renderMyTickets(tickets) {

    const container =
        document.getElementById(
            "myTickets"
        );

    if (!container) return;

    if (!Array.isArray(tickets)) {
        tickets = [];
    }

    const count =
        document.getElementById(
            "myTicketCount"
        );

    if (count) {
        count.textContent =
            tickets.length;
    }

    if (tickets.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎟️</div>
                <div>No tickets selected yet</div>
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    tickets.forEach(ticket => {

        const ticketNumber =
            ticket.ticket_number ||
            ticket.number ||
            ticket.id ||
            "";

        const card =
            document.createElement("div");

        card.className =
            "my-ticket";

        card.innerHTML = `
            <div class="my-ticket-header">
                <strong>Ticket ${ticketNumber}</strong>
            </div>

            <div class="bingo-card">
                ${renderBingoCells(ticket)}
            </div>
        `;

        container.appendChild(card);
    });
}


function renderBingoCells(ticket) {

    let card =
        ticket.card ||
        ticket.numbers ||
        [];

    if (!Array.isArray(card)) {
        return "";
    }

    /*
       Supports a flat 25-number array
       or a 5x5 array.
    */

    if (
        card.length === 5 &&
        Array.isArray(card[0])
    ) {

        card = card.flat();
    }

    let html = "";

    for (let i = 0; i < 25; i++) {

        let value =
            card[i] !== undefined
                ? card[i]
                : "";

        const free =
            i === 12;

        html += `
            <div class="bingo-cell ${free ? "free" : ""}">
                ${free ? "FREE" : value}
            </div>
        `;
    }

    return html;
}


/* =========================================================
   RANKINGS
========================================================= */

async function loadRankings() {

    try {

        const data =
            await api("/api/rank");

        const rankings =
            data.rankings ||
            data.players ||
            data.rank ||
            [];

        renderRankings(rankings);

    } catch (error) {

        console.error(
            "RANK ERROR:",
            error
        );
    }
}


function renderRankings(rankings) {

    const container =
        document.getElementById(
            "rankingList"
        );

    if (!container) return;

    if (!Array.isArray(rankings) ||
        rankings.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No ranking data yet.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    rankings.slice(0, 10)
        .forEach((player, index) => {

            const row =
                document.createElement("div");

            row.className =
                "ranking-row";

            const name =
                player.first_name ||
                player.username ||
                "Player";

            const wins =
                player.games_won ||
                player.wins ||
                0;

            const won =
                Number(
                    player.total_won ||
                    player.winnings ||
                    0
                );

            row.innerHTML = `
                <div class="rank-position">
                    ${index + 1}
                </div>

                <div class="rank-name">
                    ${escapeHtml(name)}
                </div>

                <div class="rank-wins">
                    ${wins} wins
                </div>

                <div class="rank-money">
                    ${won.toFixed(2)} ETB
                </div>
            `;

            container.appendChild(row);
        });
}


/* =========================================================
   DEPOSIT
========================================================= */

async function requestDeposit() {

    const amount =
        prompt(
            "Enter deposit amount in ETB:\nMinimum: 50 ETB"
        );

    if (amount === null) return;

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount < 50
    ) {

        showNotification(
            "Minimum deposit is 50 ETB."
        );

        return;
    }

    const reference =
        prompt(
            "Enter your Telebirr transaction/reference code:"
        );

    if (!reference) {

        showNotification(
            "Transaction reference is required."
        );

        return;
    }

    try {

        await api(
            "/api/credit-request",
            {
                method: "POST",

                body: JSON.stringify({
                    amount: numericAmount,
                    reference_code:
                        reference.trim()
                })
            }
        );

        showNotification(
            "Deposit request submitted. Waiting for admin approval."
        );

    } catch (error) {

        showNotification(
            error.message
        );
    }
}


/* =========================================================
   WITHDRAW
========================================================= */

async function requestWithdrawal() {

    const amount =
        prompt(
            "Enter withdrawal amount in ETB:"
        );

    if (amount === null) return;

    const numericAmount =
        Number(amount);

    if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
    ) {

        showNotification(
            "Enter a valid amount."
        );

        return;
    }

    const phone =
        prompt(
            "Enter the Telebirr phone number for withdrawal:"
        );

    if (!phone) {

        showNotification(
            "Telebirr phone number is required."
        );

        return;
    }

    try {

        await api(
            "/api/withdrawal-request",
            {
                method: "POST",

                body: JSON.stringify({
                    amount: numericAmount,
                    phone_number:
                        phone.trim()
                })
            }
        );

        showNotification(
            "Withdrawal request submitted."
        );

    } catch (error) {

        showNotification(
            error.message
        );
    }
}


/* =========================================================
   AUTO REFRESH
========================================================= */

function startAutoRefresh() {

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }

    refreshTimer =
        setInterval(async () => {

            try {

                if (!currentUser) {
                    return;
                }

                await loadGame();
                await loadRankings();

                /*
                   Do not recreate the ticket grid
                   every refresh.
                */

            } catch (error) {

                console.error(
                    "AUTO REFRESH:",
                    error
                );
            }

        }, 5000);
}


/* =========================================================
   SCREENS
========================================================= */

function showContactScreen() {

    const auth =
        document.getElementById(
            "authSection"
        );

    const game =
        document.getElementById(
            "gameSection"
        );

    if (auth) {
        auth.classList.remove("hidden");
    }

    if (game) {
        game.classList.add("hidden");
    }
}


function showGame() {

    const auth =
        document.getElementById(
            "authSection"
        );

    const game =
        document.getElementById(
            "gameSection"
        );

    if (auth) {
        auth.classList.add("hidden");
    }

    if (game) {
        game.classList.remove("hidden");
    }

    /*
       THIS IS IMPORTANT.
       Generate the 1-500 ticket grid
       only after the game screen exists.
    */

    createTicketGrid();
}


function showLoading(message) {

    const screen =
        document.getElementById(
            "loadingScreen"
        );

    const text =
        document.getElementById(
            "loadingText"
        );

    if (text && message) {
        text.textContent = message;
    }

    if (screen) {
        screen.classList.remove(
            "hidden"
        );
    }
}


function hideLoading() {

    const screen =
        document.getElementById(
            "loadingScreen"
        );

    if (screen) {
        screen.classList.add(
            "hidden"
        );
    }
}


function showErrorScreen(message) {

    const screen =
        document.getElementById(
            "errorSection"
        );

    const text =
        document.getElementById(
            "errorScreenMessage"
        );

    if (text) {
        text.textContent =
            message;
    }

    if (screen) {
        screen.classList.remove(
            "hidden"
        );
    }
}


/* =========================================================
   MESSAGES
========================================================= */

function showAuthMessage(message) {

    const element =
        document.getElementById(
            "authMessage"
        );

    if (element) {
        element.textContent =
            message;
    }
}


function showAuthError(message) {

    hideLoading();

    const element =
        document.getElementById(
            "authError"
        );

    if (element) {
        element.textContent =
            message;
    }

    console.error(
        "AUTH:",
        message
    );
}


function showJoinMessage(message) {

    const element =
        document.getElementById(
            "joinMessage"
        );

    if (element) {
        element.textContent =
            message;
    }
}


function showJoinError(message) {

    const element =
        document.getElementById(
            "joinError"
        );

    if (element) {
        element.textContent =
            message;
    }
}


function showNotification(message) {

    const notification =
        document.getElementById(
            "notification"
        );

    const text =
        document.getElementById(
            "notificationText"
        );

    if (!notification || !text) {

        alert(message);

        return;
    }

    text.textContent =
        message;

    notification.classList.remove(
        "hidden"
    );

    setTimeout(() => {

        notification.classList.add(
            "hidden"
        );

    }, 3500);
}


/* =========================================================
   HELPERS
========================================================= */

function formatGameStatus(status) {

    const value =
        String(status)
            .toLowerCase();

    if (value === "waiting") {
        return "Waiting for players";
    }

    if (
        value === "running" ||
        value === "active"
    ) {
        return "Game in progress";
    }

    if (
        value === "finished" ||
        value === "completed"
    ) {
        return "Game finished";
    }

    return status;
}


function escapeHtml(value) {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
