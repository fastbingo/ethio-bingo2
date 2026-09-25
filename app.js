const API_BASE =
    "https://ethio-bingo.ketiolcj.workers.dev";


/* =========================================================
   CONFIGURATION
========================================================= */

const MAX_TICKETS = 4;
const TICKET_PRICE = 10;
const TOTAL_TICKETS = 500;
const TOTAL_DRAW_NUMBERS = 20;


/* =========================================================
   STATE
========================================================= */

let tg = null;

let currentUser = null;
let currentGame = null;

let selectedTickets = new Set();

let refreshTimer = null;
let contactTimer = null;


/* =========================================================
   START APP
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        startApp();
    }
);


async function startApp() {

    try {

        tg =
            window.Telegram &&
            window.Telegram.WebApp
                ? window.Telegram.WebApp
                : null;


        if (tg) {

            tg.ready();
            tg.expand();

            try {
                tg.setHeaderColor("#07111f");
                tg.setBackgroundColor("#07111f");
            } catch (e) {}

        }


        setupButtons();


        showLoading(
            "Connecting to Telegram..."
        );


        if (
            !tg ||
            !tg.initData
        ) {

            hideLoading();

            showAuthError(
                "Please open Ethiopia Bingo from Telegram. Telegram authentication is required."
            );

            return;
        }


        await loadUser();


        hideLoading();


        setConnection(
            true,
            "Connected"
        );


        startAutoRefresh();


    } catch (error) {

        console.error(
            "START ERROR:",
            error
        );

        hideLoading();

        setConnection(
            false,
            "Offline"
        );

        showErrorScreen(
            error.message ||
            "Unable to start the application."
        );
    }
}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {

    const contactButton =
        document.getElementById(
            "contactButton"
        );

    const joinButton =
        document.getElementById(
            "joinButton"
        );

    const depositButton =
        document.getElementById(
            "depositButton"
        );

    const withdrawButton =
        document.getElementById(
            "withdrawButton"
        );

    const retryButton =
        document.getElementById(
            "retryButton"
        );


    if (contactButton) {

        contactButton.addEventListener(
            "click",
            requestContact
        );

    }


    if (joinButton) {

        joinButton.addEventListener(
            "click",
            joinGame
        );

    }


    if (depositButton) {

        depositButton.addEventListener(
            "click",
            requestDeposit
        );

    }


    if (withdrawButton) {

        withdrawButton.addEventListener(
            "click",
            requestWithdrawal
        );

    }


    if (retryButton) {

        retryButton.addEventListener(
            "click",
            () => {
                location.reload();
            }
        );

    }


    console.log(
        "Buttons initialized:",
        {
            contact: !!contactButton,
            join: !!joinButton,
            deposit: !!depositButton,
            withdraw: !!withdrawButton
        }
    );
}


/* =========================================================
   API REQUEST
========================================================= */

async function api(
    path,
    options = {}
) {

    const headers = {
        "Content-Type":
            "application/json",

        ...(options.headers || {})
    };


    if (
        tg &&
        tg.initData
    ) {

        headers[
            "X-Telegram-Init-Data"
        ] = tg.initData;

    }


    const response =
        await fetch(
            API_BASE + path,
            {
                ...options,
                headers
            }
        );


    let data = {};


    try {

        data =
            await response.json();

    } catch (error) {

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

    const data =
        await api("/api/me");


    currentUser =
        data.user ||
        data;


    renderUser();


    if (
        currentUser &&
        currentUser.contact_verified
    ) {

        showGame();

        await loadGame();

        await loadRankings();

    } else {

        showContactScreen();

        startContactPolling();
    }
}


/* =========================================================
   USER UI
========================================================= */

function renderUser() {

    if (!currentUser) {
        return;
    }


    const balance =
        Number(
            currentUser.balance || 0
        );


    const wallet =
        document.getElementById(
            "walletBalance"
        );


    if (wallet) {

        wallet.textContent =
            balance.toFixed(2);

    }


    const name =
        document.getElementById(
            "playerName"
        );


    if (name) {

        name.textContent =
            currentUser.first_name ||
            currentUser.username ||
            "Player";

    }


    const username =
        document.getElementById(
            "playerUsername"
        );


    if (username) {

        username.textContent =
            currentUser.username
                ? "@" +
                  currentUser.username
                : "Telegram Player";

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


    if (
        typeof tg.requestContact !==
        "function"
    ) {

        showAuthError(
            "Your Telegram version does not support contact sharing."
        );

        return;
    }


    const button =
        document.getElementById(
            "contactButton"
        );


    if (button) {

        button.disabled = true;

        button.textContent =
            "Requesting contact...";

    }


    try {

        tg.requestContact(
            async (shared) => {

                console.log(
                    "Contact result:",
                    shared
                );


                if (!shared) {

                    if (button) {

                        button.disabled =
                            false;

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


                    await api(
                        "/api/contact",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    shared: true
                                })
                        }
                    );


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
            }
        );

    } catch (error) {

        console.error(
            "CONTACT REQUEST ERROR:",
            error
        );


        if (button) {

            button.disabled =
                false;

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

        clearInterval(
            contactTimer
        );

    }


    contactTimer =
        setInterval(
            async () => {

                try {

                    const data =
                        await api(
                            "/api/contact-status"
                        );


                    const verified =
                        data.contact_verified ||
                        data.verified ||
                        data.user?.contact_verified;


                    if (verified) {

                        clearInterval(
                            contactTimer
                        );

                        contactTimer = null;


                        await loadUser();
                    }


                } catch (error) {

                    console.log(
                        "Contact check:",
                        error.message
                    );

                }

            },
            3000
        );
}


/* =========================================================
   GAME
========================================================= */

async function loadGame() {

    const data =
        await api("/api/game");


    currentGame =
        data.game ||
        data;


    renderGame(
        currentGame
    );
}


function renderGame(game) {

    if (!game) {
        return;
    }


    console.log(
        "GAME:",
        game
    );


    const status =
        game.status ||
        game.state ||
        "waiting";


    const statusElement =
        document.getElementById(
            "gameStatus"
        );


    if (statusElement) {

        statusElement.textContent =
            formatGameStatus(
                status
            );
    }


    const timer =
        document.getElementById(
            "gameTimer"
        );


    if (timer) {

        if (
            game.seconds_remaining !==
                undefined
        ) {

            timer.textContent =
                Math.max(
                    0,
                    Number(
                        game.seconds_remaining
                    )
                ) + "s";

        } else {

            timer.textContent =
                "--";
        }
    }


    const price =
        Number(
            game.ticket_price ||
            game.ticketPrice ||
            TICKET_PRICE
        );


    const priceElement =
        document.getElementById(
            "ticketPrice"
        );


    if (priceElement) {

        priceElement.textContent =
            price;
    }


    const pool =
        Number(
            game.prize_pool ||
            game.prizePool ||
            0
        );


    const poolElement =
        document.getElementById(
            "prizePool"
        );


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


    const playersElement =
        document.getElementById(
            "playerCount"
        );


    if (playersElement) {

        playersElement.textContent =
            players;
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
        document.getElementById(
            "ticketGrid"
        );


    if (!grid) {

        console.error(
            "ticketGrid was not found."
        );

        return;
    }


    /*
       Do not rebuild it if it already exists.
       This prevents selected tickets from disappearing
       during automatic refresh.
    */

    if (
        grid.children.length ===
        TOTAL_TICKETS
    ) {

        updateTicketSelectionUI();

        return;
    }


    grid.innerHTML = "";


    for (
        let number = 1;
        number <= TOTAL_TICKETS;
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


        button.dataset.ticket =
            String(number);


        button.textContent =
            String(number);


        /*
           DIRECT CLICK EVENT
        */

        button.addEventListener(
            "click",
            () => {

                selectTicket(
                    number,
                    button
                );

            }
        );


        grid.appendChild(
            button
        );
    }


    updateTicketSelectionUI();


    console.log(
        "500 ticket buttons created."
    );
}


/* =========================================================
   SELECT TICKET
========================================================= */

function selectTicket(
    number,
    button
) {

    number =
        Number(number);


    console.log(
        "Ticket selected/clicked:",
        number
    );


    if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 500
    ) {

        return;
    }


    /*
       REMOVE
    */

    if (
        selectedTickets.has(
            number
        )
    ) {

        selectedTickets.delete(
            number
        );


        if (button) {

            button.classList.remove(
                "selected"
            );

        }


        updateTicketSelectionUI();

        return;
    }


    /*
       MAXIMUM 4
    */

    if (
        selectedTickets.size >=
        MAX_TICKETS
    ) {

        showNotification(
            "Maximum 4 tickets allowed."
        );


        try {

            tg?.HapticFeedback?.notificationOccurred(
                "warning"
            );

        } catch (e) {}


        return;
    }


    /*
       ADD
    */

    selectedTickets.add(
        number
    );


    if (button) {

        button.classList.add(
            "selected"
        );

    }


    updateTicketSelectionUI();


    try {

        tg?.HapticFeedback?.selectionChanged();

    } catch (e) {}
}


/* =========================================================
   TICKET SUMMARY
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
            total;

    }


    /*
       Make sure selected visual state
       is always correct.
    */

    const buttons =
        document.querySelectorAll(
            ".ticket-number"
        );


    buttons.forEach(
        button => {

            const number =
                Number(
                    button.dataset.ticket
                );


            button.classList.toggle(
                "selected",
                selectedTickets.has(
                    number
                )
            );

        }
    );


    const joinButton =
        document.getElementById(
            "joinButton"
        );


    if (!joinButton) {
        return;
    }


    if (count === 0) {

        joinButton.disabled =
            true;

        joinButton.textContent =
            "🎟️ Select Tickets";

    } else {

        joinButton.disabled =
            false;

        joinButton.textContent =
            `🎟️ Join Game • ${total} ETB`;
    }
}


/* =========================================================
   JOIN GAME
========================================================= */

async function joinGame() {

    if (
        selectedTickets.size < 1
    ) {

        showNotification(
            "Please select at least 1 ticket."
        );

        return;
    }


    if (
        selectedTickets.size >
        MAX_TICKETS
    ) {

        showNotification(
            "Maximum 4 tickets allowed."
        );

        return;
    }


    const tickets =
        Array.from(
            selectedTickets
        )
        .map(Number)
        .sort(
            (a, b) =>
                a - b
        );


    const totalCost =
        tickets.length *
        TICKET_PRICE;


    if (
        currentUser &&
        Number(
            currentUser.balance || 0
        ) <
        totalCost
    ) {

        showNotification(
            "Insufficient wallet balance. Please deposit first."
        );

        return;
    }


    const button =
        document.getElementById(
            "joinButton"
        );


    if (button) {

        button.disabled =
            true;

        button.textContent =
            "Joining game...";
    }


    try {

        const data =
            await api(
                "/api/join",
                {
                    method: "POST",

                    body:
                        JSON.stringify({
                            tickets:
                                tickets,

                            ticket_numbers:
                                tickets
                        })
                }
            );


        console.log(
            "JOIN RESPONSE:",
            data
        );


        selectedTickets.clear();


        updateTicketSelectionUI();


        showJoinMessage(
            "You successfully joined the game."
        );


        showNotification(
            "Tickets purchased successfully."
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

            button.disabled =
                false;
        }


        updateTicketSelectionUI();
    }
}


/* =========================================================
   MASTER BOARD
========================================================= */

function renderCalledNumbers(
    numbers
) {

    if (
        !Array.isArray(numbers)
    ) {

        numbers = [];
    }


    const last =
        document.getElementById(
            "lastCalledNumber"
        );


    if (last) {

        last.textContent =
            numbers.length
                ? numbers[
                    numbers.length - 1
                  ]
                : "—";
    }


    const progress =
        document.getElementById(
            "drawProgress"
        );


    if (progress) {

        progress.textContent =
            `${numbers.length} / ${TOTAL_DRAW_NUMBERS} numbers`;
    }


    const board =
        document.getElementById(
            "masterBoard"
        );


    if (!board) {
        return;
    }


    board.innerHTML = "";


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
            "master-number";


        cell.textContent =
            number;


        if (
            numbers.includes(
                number
            )
        ) {

            cell.classList.add(
                "called"
            );
        }


        board.appendChild(
            cell
        );
    }
}


/* =========================================================
   MY TICKETS
========================================================= */

function renderMyTickets(
    tickets
) {

    const container =
        document.getElementById(
            "myTickets"
        );


    if (!container) {
        return;
    }


    if (
        !Array.isArray(tickets)
    ) {

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


    if (
        tickets.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎟️</div>
                <div>No tickets selected yet</div>
            </div>
        `;

        return;
    }


    container.innerHTML = "";


    tickets.forEach(
        ticket => {

            const number =
                ticket.ticket_number ||
                ticket.number ||
                ticket.id ||
                "";


            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "my-ticket";


            card.innerHTML = `
                <div class="my-ticket-header">
                    Ticket ${number}
                </div>

                <div class="bingo-card">
                    ${renderBingoCells(ticket)}
                </div>
            `;


            container.appendChild(
                card
            );
        }
    );
}


function renderBingoCells(
    ticket
) {

    let card =
        ticket.card ||
        ticket.numbers ||
        [];


    if (
        !Array.isArray(card)
    ) {

        return "";
    }


    if (
        card.length === 5 &&
        Array.isArray(
            card[0]
        )
    ) {

        card =
            card.flat();
    }


    let html = "";


    for (
        let i = 0;
        i < 25;
        i++
    ) {

        const value =
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
            await api(
                "/api/rank"
            );


        const rankings =
            data.rankings ||
            data.players ||
            data.rank ||
            [];


        renderRankings(
            rankings
        );


    } catch (error) {

        console.error(
            "RANK ERROR:",
            error
        );
    }
}


function renderRankings(
    rankings
) {

    const container =
        document.getElementById(
            "rankingList"
        );


    if (!container) {
        return;
    }


    if (
        !Array.isArray(rankings) ||
        rankings.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                No ranking data yet.
            </div>
        `;

        return;
    }


    container.innerHTML = "";


    rankings
        .slice(0, 10)
        .forEach(
            (player, index) => {

                const row =
                    document.createElement(
                        "div"
                    );


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


                const winnings =
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
                        ${winnings.toFixed(2)} ETB
                    </div>
                `;


                container.appendChild(
                    row
                );
            }
        );
}


/* =========================================================
   DEPOSIT
========================================================= */

async function requestDeposit() {

    /*
       FIRST show the exact Telebirr account.
    */

    const instructions =
        "DEPOSIT VIA TELEBIRR\n\n" +
        "Send money to:\n\n" +
        "📱 0920384625\n" +
        "👤 EFA\n\n" +
        "Minimum deposit: 50 ETB\n\n" +
        "After sending the money, enter your transaction/reference code.";

    
    if (tg && tg.showPopup) {

        try {

            tg.showPopup(
                {
                    title:
                        "Telebirr Deposit",

                    message:
                        instructions,

                    buttons:
                        [
                            {
                                id:
                                    "continue",

                                type:
                                    "default",

                                text:
                                    "Continue"
                            },

                            {
                                id:
                                    "cancel",

                                type:
                                    "cancel",

                                text:
                                    "Cancel"
                            }
                        ]
                },

                async (buttonId) => {

                    if (
                        buttonId ===
                        "continue"
                    ) {

                        await submitDeposit();
                    }

                }
            );

            return;

        } catch (error) {

            console.log(
                "Telegram popup unavailable:",
                error
            );
        }
    }


    /*
       Browser/Telegram fallback.
    */

    alert(
        instructions
    );


    await submitDeposit();
}


/* =========================================================
   SUBMIT DEPOSIT
========================================================= */

async function submitDeposit() {

    const amount =
        prompt(
            "Enter the amount you sent in ETB.\nMinimum: 50 ETB"
        );


    if (
        amount === null
    ) {

        return;
    }


    const numericAmount =
        Number(amount);


    if (
        !Number.isFinite(
            numericAmount
        ) ||
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


    if (
        !reference ||
        !reference.trim()
    ) {

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

                body:
                    JSON.stringify({
                        amount:
                            numericAmount,

                        reference_code:
                            reference.trim()
                    })
            }
        );


        showNotification(
            "Deposit request submitted. Please wait for admin approval."
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


    if (
        amount === null
    ) {

        return;
    }


    const numericAmount =
        Number(amount);


    if (
        !Number.isFinite(
            numericAmount
        ) ||
        numericAmount <= 0
    ) {

        showNotification(
            "Enter a valid withdrawal amount."
        );

        return;
    }


    if (
        currentUser &&
        numericAmount >
        Number(
            currentUser.balance || 0
        )
    ) {

        showNotification(
            "Insufficient wallet balance."
        );

        return;
    }


    const phone =
        prompt(
            "Enter the Telebirr phone number where you want to receive the money:"
        );


    if (
        !phone ||
        !phone.trim()
    ) {

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

                body:
                    JSON.stringify({
                        amount:
                            numericAmount,

                        phone_number:
                            phone.trim()
                    })
            }
        );


        showNotification(
            "Withdrawal request submitted. Waiting for admin approval."
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

        clearInterval(
            refreshTimer
        );
    }


    refreshTimer =
        setInterval(
            async () => {

                try {

                    if (!currentUser) {
                        return;
                    }


                    /*
                       Reload user so approved deposits
                       immediately update the wallet.
                    */

                    const data =
                        await api(
                            "/api/me"
                        );


                    currentUser =
                        data.user ||
                        data;


                    renderUser();


                    await loadGame();


                    await loadRankings();


                } catch (error) {

                    console.error(
                        "AUTO REFRESH:",
                        error
                    );

                    setConnection(
                        false,
                        "Connection issue"
                    );
                }

            },
            5000
        );
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

        auth.classList.remove(
            "hidden"
        );
    }


    if (game) {

        game.classList.add(
            "hidden"
        );
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

        auth.classList.add(
            "hidden"
        );
    }


    if (game) {

        game.classList.remove(
            "hidden"
        );
    }


    /*
       IMPORTANT:
       Ticket buttons are generated here.
    */

    createTicketGrid();
}


/* =========================================================
   LOADING
========================================================= */

function showLoading(
    message
) {

    const screen =
        document.getElementById(
            "loadingScreen"
        );


    const text =
        document.getElementById(
            "loadingText"
        );


    if (
        text &&
        message
    ) {

        text.textContent =
            message;
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


/* =========================================================
   ERROR
========================================================= */

function showErrorScreen(
    message
) {

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


function showAuthMessage(
    message
) {

    const element =
        document.getElementById(
            "authMessage"
        );


    if (element) {

        element.textContent =
            message;
    }
}


function showAuthError(
    message
) {

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


function showJoinMessage(
    message
) {

    const element =
        document.getElementById(
            "joinMessage"
        );


    if (element) {

        element.textContent =
            message;
    }
}


function showJoinError(
    message
) {

    const element =
        document.getElementById(
            "joinError"
        );


    if (element) {

        element.textContent =
            message;
    }
}


/* =========================================================
   NOTIFICATION
========================================================= */

function showNotification(
    message
) {

    const notification =
        document.getElementById(
            "notification"
        );


    const text =
        document.getElementById(
            "notificationText"
        );


    if (
        !notification ||
        !text
    ) {

        alert(message);

        return;
    }


    text.textContent =
        message;


    notification.classList.remove(
        "hidden"
    );


    setTimeout(
        () => {

            notification.classList.add(
                "hidden"
            );

        },
        4000
    );
}


/* =========================================================
   CONNECTION
========================================================= */

function setConnection(
    connected,
    text
) {

    const status =
        document.getElementById(
            "connectionStatus"
        );


    const label =
        document.getElementById(
            "connectionText"
        );


    if (label) {

        label.textContent =
            text;
    }


    if (status) {

        status.classList.toggle(
            "offline",
            !connected
        );
    }
}


/* =========================================================
   GAME STATUS
========================================================= */

function formatGameStatus(
    status
) {

    const value =
        String(status)
            .toLowerCase();


    if (
        value ===
        "waiting"
    ) {

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


/* =========================================================
   HTML ESCAPE
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
