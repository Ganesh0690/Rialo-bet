const API = "";
let currentUser = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showToast(msg, type = "success") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast show ${type}`;
  setTimeout(() => (t.className = "toast hidden"), 3000);
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncateHash(hash) {
  if (!hash) return "";
  return hash.slice(0, 10) + "..." + hash.slice(-8);
}

async function handleLogin() {
  const username = $("#loginUsername").value.trim();
  const email = $("#loginEmail").value.trim();
  if (!username || !email) return showToast("Fill in all fields", "error");

  try {
    const { user } = await api("/api/auth/login", {
      method: "POST",
      body: { username, email },
    });
    currentUser = user;
    $("#loginSection").classList.add("hidden");
    $("#appSection").classList.remove("hidden");
    $("#userInfo").classList.remove("hidden");
    updateUserUI();
    loadBets();
    showToast(`Welcome, ${user.username}!`);
  } catch (e) {
    showToast(e.message, "error");
  }
}

function updateUserUI() {
  if (!currentUser) return;
  $("#userBalance").textContent = currentUser.balance.toFixed(0);
  $("#userAvatar").textContent = currentUser.username[0].toUpperCase();
}

async function refreshUser() {
  if (!currentUser) return;
  const { user } = await api(`/api/users/${currentUser.id}`);
  currentUser = user;
  updateUserUI();
}

async function handleCreateBet() {
  const question = $("#betQuestion").value.trim();
  const city = $("#betCity").value.trim();
  const condition = $("#betCondition").value;
  const stakeAmount = parseInt($("#betStake").value) || 10;
  const threshold = parseInt($("#betThreshold").value) || 25;

  if (!question) return showToast("Enter a question", "error");
  if (!city) return showToast("Enter a city", "error");

  try {
    const resolveData = { city, condition };
    if (condition === "temperature") resolveData.threshold = threshold;

    await api("/api/bets/create", {
      method: "POST",
      body: {
        creatorId: currentUser.id,
        question,
        stakeAmount,
        category: "weather",
        resolveData,
      },
    });

    $("#betQuestion").value = "";
    showToast("Bet created! Auto-resolve scheduled on-chain.");
    switchTab("browse");
    loadBets();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function loadBets() {
  try {
    const { bets } = await api("/api/bets");
    renderBets(bets, "betsList", "noBets");
  } catch (e) {
    console.error(e);
  }
}

async function loadHistory() {
  if (!currentUser) return;
  try {
    const { bets } = await api(`/api/users/${currentUser.id}/history`);
    renderBets(bets, "historyList", "noHistory");
  } catch (e) {
    console.error(e);
  }
}

function renderBets(bets, containerId, emptyId) {
  const container = $(`#${containerId}`);
  const empty = $(`#${emptyId}`);

  if (!bets.length) {
    container.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  const totalVoters = (b) => b.yesVoters.length + b.noVoters.length;
  const yesPercent = (b) => {
    const t = totalVoters(b);
    if (!t) return 50;
    return (b.yesVoters.length / t) * 100;
  };

  container.innerHTML = bets
    .map(
      (b) => `
    <div class="bet-card" onclick="openBetModal('${b.id}')">
      <div class="bet-card-header">
        <span class="bet-question">${escHtml(b.question)}</span>
        <span class="bet-status ${b.status === "open" ? "status-open" : "status-resolved"}">
          ${b.status}
        </span>
      </div>
      <div class="bet-meta">
        <div class="bet-meta-item">
          Pool <span class="bet-meta-value">${b.totalPool}</span>
        </div>
        <div class="bet-meta-item">
          Stakers <span class="bet-meta-value">${totalVoters(b)}</span>
        </div>
        <div class="bet-meta-item">
          Min <span class="bet-meta-value">${b.stakeAmount}</span>
        </div>
        <div class="bet-meta-item">
          ${timeAgo(b.createdAt)}
        </div>
      </div>
      <div class="bet-bar">
        <div class="bet-bar-fill" style="width:${yesPercent(b)}%"></div>
      </div>
    </div>
  `
    )
    .join("");
}

async function openBetModal(betId) {
  try {
    const { bet } = await api(`/api/bets/${betId}`);
    renderModal(bet);
    $("#betModal").classList.remove("hidden");
  } catch (e) {
    showToast(e.message, "error");
  }
}

function renderModal(bet) {
  const isOpen = bet.status === "open";
  const alreadyStaked =
    bet.yesVoters.some((v) => v.userId === currentUser.id) ||
    bet.noVoters.some((v) => v.userId === currentUser.id);

  let outcomeHtml = "";
  if (bet.status === "resolved") {
    outcomeHtml = `
      <div class="outcome-banner ${bet.outcome === "yes" ? "outcome-yes" : "outcome-no"}">
        <div class="outcome-label">Resolved Outcome</div>
        <div class="outcome-value">${bet.outcome === "yes" ? "YES" : "NO"}</div>
      </div>
    `;
  }

  let weatherProofHtml = "";
  if (bet.weatherData) {
    const wd = bet.weatherData;
    weatherProofHtml = `
      <div class="weather-proof">
        <h4>Weather API Proof (Native Web Call)</h4>
        <div class="proof-item">
          <span>City</span>
          <span class="proof-value">${wd.name || "N/A"}</span>
        </div>
        <div class="proof-item">
          <span>Condition</span>
          <span class="proof-value">${wd.weather ? wd.weather[0].description : "N/A"}</span>
        </div>
        <div class="proof-item">
          <span>Temperature</span>
          <span class="proof-value">${wd.main ? wd.main.temp + "°C" : "N/A"}</span>
        </div>
        <div class="proof-item">
          <span>Source</span>
          <span class="proof-value">${wd.simulated ? "Simulated (demo)" : "OpenWeatherMap API"}</span>
        </div>
      </div>
    `;
  }

  let stakeHtml = "";
  if (isOpen && !alreadyStaked) {
    stakeHtml = `
      <div class="stake-section">
        <h3>Place Your Stake</h3>
        <div class="stake-input-row">
          <input type="number" id="stakeAmount" placeholder="Amount" value="${bet.stakeAmount}" min="${bet.stakeAmount}">
        </div>
        <div class="stake-actions">
          <button class="btn btn-yes" onclick="placeBet('${bet.id}', 'yes')">Stake YES</button>
          <button class="btn btn-no" onclick="placeBet('${bet.id}', 'no')">Stake NO</button>
        </div>
      </div>
    `;
  } else if (isOpen && alreadyStaked) {
    stakeHtml = `<div class="info-box"><span class="info-icon">&#10003;</span><span>You already staked on this bet.</span></div>`;
  }

  let resolveHtml = "";
  if (isOpen) {
    resolveHtml = `
      <button class="btn btn-resolve btn-full btn-sm" onclick="resolveBet('${bet.id}')" style="margin-top:16px">
        Trigger Resolve (Simulate Weather API Call)
      </button>
    `;
  }

  const votersList = (voters, type) => {
    if (!voters.length) return `<p style="color:var(--text-dim);font-size:13px">No stakers yet</p>`;
    return voters
      .map(
        (v) => `
      <div class="voter">
        <span class="voter-name">${escHtml(v.username)}</span>
        <span class="voter-amount voter-${type}">${v.amount} tokens${v.payout !== undefined ? ` → ${v.payout.toFixed(0)} payout` : ""}</span>
      </div>
    `
      )
      .join("");
  };

  $("#modalBody").innerHTML = `
    ${outcomeHtml}
    <div class="modal-question">${escHtml(bet.question)}</div>
    <div class="modal-meta">
      by ${escHtml(bet.creator.username)} · ${bet.resolveData ? bet.resolveData.city : "N/A"} · ${bet.resolveData ? bet.resolveData.condition : "N/A"}
    </div>
    ${stakeHtml}
    <div class="stake-section">
      <h3>YES Stakers (${bet.yesVoters.length})</h3>
      <div class="voters-list">${votersList(bet.yesVoters, "yes")}</div>
    </div>
    <div class="stake-section">
      <h3>NO Stakers (${bet.noVoters.length})</h3>
      <div class="voters-list">${votersList(bet.noVoters, "no")}</div>
    </div>
    ${weatherProofHtml}
    ${resolveHtml}
    <div class="tx-hash">tx: ${truncateHash(bet.txHash)} · block #${bet.blockNumber}</div>
  `;
}

async function placeBet(betId, position) {
  const amount = parseInt($("#stakeAmount").value) || 10;
  try {
    const { bet, user } = await api(`/api/bets/${betId}/stake`, {
      method: "POST",
      body: { userId: currentUser.id, position, amount },
    });
    currentUser = user;
    updateUserUI();
    renderModal(bet);
    showToast(`Staked ${amount} tokens on ${position.toUpperCase()}!`);
    loadBets();
  } catch (e) {
    showToast(e.message, "error");
  }
}

async function resolveBet(betId) {
  try {
    const { bet, weatherData } = await api(`/api/bets/${betId}/resolve`, {
      method: "POST",
      body: {},
    });
    await refreshUser();
    renderModal(bet);
    showToast(
      `Bet resolved: ${bet.outcome.toUpperCase()}! Weather: ${
        weatherData?.weather?.[0]?.description || "checked"
      }`
    );
    loadBets();
  } catch (e) {
    showToast(e.message, "error");
  }
}

function closeModal() {
  $("#betModal").classList.add("hidden");
}

function switchTab(tabName) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
  $$(".tab-content").forEach((c) => c.classList.toggle("active", c.id === `tab-${tabName}`));
  if (tabName === "browse") loadBets();
  if (tabName === "history") loadHistory();
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

document.addEventListener("DOMContentLoaded", () => {
  $("#loginBtn").addEventListener("click", handleLogin);
  $("#loginEmail").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });
  $("#createBetBtn").addEventListener("click", handleCreateBet);
  $("#refreshBets").addEventListener("click", loadBets);
  $("#modalClose").addEventListener("click", closeModal);
  $(".modal-backdrop")?.addEventListener("click", closeModal);

  $$(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );

  $("#betCondition").addEventListener("change", (e) => {
    $("#thresholdGroup").style.display =
      e.target.value === "temperature" ? "block" : "none";
  });
});
