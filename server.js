const express = require("express");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const app = express();
const PORT = 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const bets = new Map();
const users = new Map();
function generateWallet() {
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}
function simulateResolve(category, resolveData) {
  const rand = Math.random();
  const simulations = {
    weather: () => {
      const isRain = rand > 0.5;
      return {
        outcome: isRain ? "yes" : "no",
        proof: {
          source: "OpenWeatherMap API",
          endpoint: "api.openweathermap.org/data/2.5/weather?q=" + (resolveData.city || "New York"),
          data: { city: resolveData.city || "New York", condition: isRain ? "Rain" : "Clear sky", temperature: Math.floor(Math.random() * 35) + 5 + " C", humidity: Math.floor(Math.random() * 60) + 40 + "%" },
          simulated: true,
        },
      };
    },
    crypto: () => {
      const bases = { BTC: 67000, ETH: 3200, SOL: 140, XRP: 0.55, DOGE: 0.08 };
      const coin = (resolveData.coin || "BTC").toUpperCase();
      const base = bases[coin] || 100;
      const price = base + (Math.random() * base * 0.3 - base * 0.15);
      const threshold = parseFloat(resolveData.threshold) || base;
      return {
        outcome: price > threshold ? "yes" : "no",
        proof: {
          source: "CoinGecko API",
          endpoint: "api.coingecko.com/api/v3/simple/price?ids=" + coin.toLowerCase(),
          data: { coin, currentPrice: "$" + price.toFixed(2), threshold: "$" + Number(threshold).toLocaleString(), result: price > threshold ? "Above threshold" : "Below threshold", change24h: (Math.random() * 10 - 5).toFixed(2) + "%" },
          simulated: true,
        },
      };
    },
    sports: () => {
      const homeScore = Math.floor(Math.random() * 5);
      const awayScore = Math.floor(Math.random() * 5);
      const teamWon = homeScore > awayScore;
      return {
        outcome: teamWon ? "yes" : "no",
        proof: {
          source: "ESPN API / SportsData.io",
          endpoint: "api.sportsdata.io/v3/scores/json/GamesByDate",
          data: { match: resolveData.match || "Team A vs Team B", score: homeScore + " - " + awayScore, team: resolveData.team || "Team A", result: teamWon ? "Win" : homeScore === awayScore ? "Draw" : "Loss" },
          simulated: true,
        },
      };
    },
    stocks: () => {
      const ticker = (resolveData.ticker || "AAPL").toUpperCase();
      const bases = { AAPL: 195, GOOGL: 175, TSLA: 250, AMZN: 185, NVDA: 880, META: 500 };
      const base = bases[ticker] || 150;
      const price = base + (Math.random() * base * 0.1 - base * 0.05);
      const threshold = parseFloat(resolveData.threshold) || base;
      return {
        outcome: price > threshold ? "yes" : "no",
        proof: {
          source: "Alpha Vantage API",
          endpoint: "alphavantage.co/query?function=GLOBAL_QUOTE&symbol=" + ticker,
          data: { ticker, currentPrice: "$" + price.toFixed(2), threshold: "$" + Number(threshold).toFixed(2), result: price > threshold ? "Above target" : "Below target", volume: Math.floor(Math.random() * 50000000).toLocaleString() },
          simulated: true,
        },
      };
    },
    flights: () => {
      const delayed = rand > 0.55;
      return {
        outcome: delayed ? "yes" : "no",
        proof: {
          source: "AviationStack API",
          endpoint: "api.aviationstack.com/v1/flights?flight_iata=" + (resolveData.flightNumber || "AA100"),
          data: { flight: resolveData.flightNumber || "AA100", route: resolveData.route || "JFK to LAX", status: delayed ? "Delayed" : "On Time", delay: delayed ? Math.floor(Math.random() * 180) + 10 + " min" : "0 min" },
          simulated: true,
        },
      };
    },
    custom: () => ({
      outcome: rand > 0.5 ? "yes" : "no",
      proof: {
        source: "Custom API / Community Vote",
        endpoint: resolveData.apiUrl || "N/A",
        data: { method: resolveData.apiUrl ? "Custom API endpoint" : "Creator resolution", note: "On Rialo any public API can be called natively from the smart contract" },
        simulated: true,
      },
    }),
  };
  return (simulations[category] || simulations.custom)();
}
app.post("/api/auth/login", (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) return res.status(400).json({ error: "Username and email required" });
  let user = Array.from(users.values()).find((u) => u.email === email);
  if (!user) {
    user = { id: uuidv4(), username, email, wallet: generateWallet(), balance: 1000, createdAt: Date.now() };
    users.set(user.id, user);
  }
  res.json({ user });
});
app.post("/api/bets/create", (req, res) => {
  const { creatorId, question, stakeAmount, category, resolveData } = req.body;
  const creator = users.get(creatorId);
  if (!creator) return res.status(404).json({ error: "User not found" });
  if (creator.balance < stakeAmount) return res.status(400).json({ error: "Insufficient balance" });
  const labels = { weather: "Weather", crypto: "Crypto Price", sports: "Sports", stocks: "Stocks", flights: "Flights", custom: "Custom" };
  const bet = {
    id: uuidv4(),
    creator: { id: creator.id, username: creator.username, wallet: creator.wallet },
    question, category, categoryLabel: labels[category] || "Custom", stakeAmount, resolveData,
    status: "open", yesVoters: [], noVoters: [], totalPool: 0,
    createdAt: Date.now(), resolvedAt: null, outcome: null, apiProof: null,
    txHash: "0x" + uuidv4().replace(/-/g, "") + uuidv4().replace(/-/g, "").slice(0, 24),
    blockNumber: Math.floor(Math.random() * 1000000) + 9000000,
  };
  bets.set(bet.id, bet);
  res.json({ bet });
});
app.post("/api/bets/:betId/stake", (req, res) => {
  const { userId, position, amount } = req.body;
  const bet = bets.get(req.params.betId);
  const user = users.get(userId);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (bet.status !== "open") return res.status(400).json({ error: "Bet is not open" });
  if (user.balance < amount) return res.status(400).json({ error: "Insufficient balance" });
  const alreadyVoted = bet.yesVoters.find((v) => v.userId === userId) || bet.noVoters.find((v) => v.userId === userId);
  if (alreadyVoted) return res.status(400).json({ error: "Already staked on this bet" });
  user.balance -= amount;
  bet.totalPool += amount;
  const entry = { userId, username: user.username, wallet: user.wallet, amount, timestamp: Date.now() };
  if (position === "yes") { bet.yesVoters.push(entry); } else { bet.noVoters.push(entry); }
  res.json({ bet, user });
});
app.post("/api/bets/:betId/resolve", async (req, res) => {
  const bet = bets.get(req.params.betId);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  if (bet.status !== "open") return res.status(400).json({ error: "Bet already resolved" });
  const { outcome, proof } = simulateResolve(bet.category, bet.resolveData || {});
  bet.status = "resolved";
  bet.outcome = outcome;
  bet.resolvedAt = Date.now();
  bet.apiProof = proof;
  const winners = outcome === "yes" ? bet.yesVoters : bet.noVoters;
  const totalWinnerStake = winners.reduce((sum, v) => sum + v.amount, 0);
  winners.forEach((winner) => {
    const user = users.get(winner.userId);
    if (user && totalWinnerStake > 0) { const share = (winner.amount / totalWinnerStake) * bet.totalPool; user.balance += share; winner.payout = share; }
  });
  const losers = outcome === "yes" ? bet.noVoters : bet.yesVoters;
  losers.forEach((loser) => { loser.payout = 0; });
  res.json({ bet, proof });
});
app.get("/api/bets", (req, res) => { res.json({ bets: Array.from(bets.values()).sort((a, b) => b.createdAt - a.createdAt) }); });
app.get("/api/bets/:betId", (req, res) => { const bet = bets.get(req.params.betId); if (!bet) return res.status(404).json({ error: "Bet not found" }); res.json({ bet }); });
app.get("/api/users/:userId", (req, res) => { const user = users.get(req.params.userId); if (!user) return res.status(404).json({ error: "User not found" }); res.json({ user }); });
app.get("/api/users/:userId/history", (req, res) => {
  const userId = req.params.userId;
  const userBets = Array.from(bets.values()).filter((b) => b.creator.id === userId || b.yesVoters.some((v) => v.userId === userId) || b.noVoters.some((v) => v.userId === userId));
  res.json({ bets: userBets });
});
app.listen(PORT, () => { console.log("\n  Bet With Friends - Rialo Demo\n  Running at http://localhost:" + PORT + "\n"); });
