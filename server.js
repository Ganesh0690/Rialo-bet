const express = require("express");
const { v4: uuidv4 } = require("uuid");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const bets = new Map();
const users = new Map();

const WEATHER_API_KEY = "YOUR_API_KEY_HERE";
const WEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5";

function generateWallet() {
  const chars = "0123456789abcdef";
  let addr = "0x";
  for (let i = 0; i < 40; i++) {
    addr += chars[Math.floor(Math.random() * chars.length)];
  }
  return addr;
}

app.post("/api/auth/login", (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: "Username and email required" });
  }

  let user = Array.from(users.values()).find((u) => u.email === email);
  if (!user) {
    user = {
      id: uuidv4(),
      username,
      email,
      wallet: generateWallet(),
      balance: 1000,
      createdAt: Date.now(),
    };
    users.set(user.id, user);
  }

  res.json({ user });
});

app.post("/api/bets/create", (req, res) => {
  const { creatorId, question, stakeAmount, category, resolveData } = req.body;

  const creator = users.get(creatorId);
  if (!creator) return res.status(404).json({ error: "User not found" });
  if (creator.balance < stakeAmount)
    return res.status(400).json({ error: "Insufficient balance" });

  const bet = {
    id: uuidv4(),
    creator: {
      id: creator.id,
      username: creator.username,
      wallet: creator.wallet,
    },
    question,
    category,
    stakeAmount,
    resolveData,
    status: "open",
    yesVoters: [],
    noVoters: [],
    totalPool: 0,
    createdAt: Date.now(),
    resolvedAt: null,
    outcome: null,
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
  if (bet.status !== "open")
    return res.status(400).json({ error: "Bet is not open" });
  if (user.balance < amount)
    return res.status(400).json({ error: "Insufficient balance" });

  const alreadyVoted =
    bet.yesVoters.find((v) => v.userId === userId) ||
    bet.noVoters.find((v) => v.userId === userId);
  if (alreadyVoted)
    return res.status(400).json({ error: "Already staked on this bet" });

  user.balance -= amount;
  bet.totalPool += amount;

  const entry = {
    userId,
    username: user.username,
    wallet: user.wallet,
    amount,
    timestamp: Date.now(),
  };

  if (position === "yes") {
    bet.yesVoters.push(entry);
  } else {
    bet.noVoters.push(entry);
  }

  res.json({ bet, user });
});

app.post("/api/bets/:betId/resolve", async (req, res) => {
  const bet = bets.get(req.params.betId);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  if (bet.status !== "open")
    return res.status(400).json({ error: "Bet already resolved" });

  let outcome;
  let weatherData = null;

  if (bet.category === "weather" && bet.resolveData) {
    try {
      if (WEATHER_API_KEY !== "YOUR_API_KEY_HERE") {
        const fetch = (await import("node-fetch")).default;
        const response = await fetch(
          `${WEATHER_BASE_URL}/weather?q=${bet.resolveData.city}&appid=${WEATHER_API_KEY}&units=metric`
        );
        weatherData = await response.json();

        if (bet.resolveData.condition === "rain") {
          const rainyIds = [200, 201, 202, 230, 231, 232, 300, 301, 302, 310, 311, 312, 313, 314, 321, 500, 501, 502, 503, 504, 511, 520, 521, 522, 531];
          outcome = rainyIds.includes(weatherData.weather[0].id) ? "yes" : "no";
        } else if (bet.resolveData.condition === "temperature") {
          outcome = weatherData.main.temp > bet.resolveData.threshold ? "yes" : "no";
        }
      } else {
        outcome = Math.random() > 0.5 ? "yes" : "no";
        weatherData = {
          simulated: true,
          weather: [{ main: outcome === "yes" ? "Rain" : "Clear", description: outcome === "yes" ? "light rain" : "clear sky" }],
          main: { temp: outcome === "yes" ? 15 : 28 },
          name: bet.resolveData.city || "NYC",
        };
      }
    } catch (err) {
      outcome = Math.random() > 0.5 ? "yes" : "no";
      weatherData = { simulated: true, error: err.message };
    }
  } else {
    const { outcome: manualOutcome } = req.body;
    outcome = manualOutcome;
  }

  bet.status = "resolved";
  bet.outcome = outcome;
  bet.resolvedAt = Date.now();
  bet.weatherData = weatherData;

  const winners = outcome === "yes" ? bet.yesVoters : bet.noVoters;
  const totalWinnerStake = winners.reduce((sum, v) => sum + v.amount, 0);

  winners.forEach((winner) => {
    const user = users.get(winner.userId);
    if (user && totalWinnerStake > 0) {
      const share = (winner.amount / totalWinnerStake) * bet.totalPool;
      user.balance += share;
      winner.payout = share;
    }
  });

  const losers = outcome === "yes" ? bet.noVoters : bet.yesVoters;
  losers.forEach((loser) => {
    loser.payout = 0;
  });

  res.json({ bet, weatherData });
});

app.get("/api/bets", (req, res) => {
  const allBets = Array.from(bets.values()).sort(
    (a, b) => b.createdAt - a.createdAt
  );
  res.json({ bets: allBets });
});

app.get("/api/bets/:betId", (req, res) => {
  const bet = bets.get(req.params.betId);
  if (!bet) return res.status(404).json({ error: "Bet not found" });
  res.json({ bet });
});

app.get("/api/users/:userId", (req, res) => {
  const user = users.get(req.params.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

app.get("/api/users/:userId/history", (req, res) => {
  const userId = req.params.userId;
  const userBets = Array.from(bets.values()).filter(
    (b) =>
      b.creator.id === userId ||
      b.yesVoters.some((v) => v.userId === userId) ||
      b.noVoters.some((v) => v.userId === userId)
  );
  res.json({ bets: userBets });
});

app.listen(PORT, () => {
  console.log(`\n  Bet With Friends - Rialo Demo`);
  console.log(`  Running at http://localhost:${PORT}\n`);
});
