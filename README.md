# Bet With Friends — Built for Rialo

A social betting dApp where friends drop questions like "Will it rain tomorrow in NYC?", stake tokens on YES/NO, and the smart contract auto-resolves by calling a weather API directly on-chain — no oracle, no middleware.

Built to showcase **Rialo's native web call** and **reactive transaction** capabilities.

---

## What This Demonstrates

| Rialo Feature | How It's Used |
|---|---|
| Native Web Calls | Smart contract calls OpenWeatherMap API directly via HTTPS |
| Reactive Transactions | Bet auto-resolves at scheduled time without external bots |
| Social Identity | Users log in with email — no wallet, no seed phrase |
| Native Messaging | Winners/losers get notified via email/SMS from the contract |
| Event-Driven Logic | Bet creation, staking, resolution all emit on-chain events |
| Escrow & Auto-Payout | Pool funds held in contract, winners paid proportionally |

---

## Project Structure

```
bet-with-friends-rialo/
├── server.js                    # Express backend (simulates on-chain logic)
├── package.json
├── contracts/
│   └── bet_with_friends.rs      # Rialo smart contract (Rust/RISC-V)
├── public/
│   ├── index.html               # Main UI
│   ├── css/style.css            # Dark theme stylesheet
│   └── js/app.js                # Frontend logic
└── README.md
```

---

## Setup on Windows (VS Code)

### Prerequisites

- **Node.js** (v18+): Download from https://nodejs.org
- **VS Code**: You already have this

### Step-by-Step

1. **Extract the zip** to any folder, e.g. `C:\Projects\bet-with-friends-rialo`

2. **Open in VS Code**
   - File > Open Folder > select `bet-with-friends-rialo`

3. **Open the terminal** in VS Code
   - Press `` Ctrl + ` `` (backtick) or go to Terminal > New Terminal

4. **Install dependencies**
   ```
   npm install
   ```

5. **Start the server**
   ```
   npm start
   ```

6. **Open your browser**
   - Go to `http://localhost:3000`

7. **Try it out**
   - Enter any username + email to log in
   - Create a bet like "Will it rain tomorrow in London?"
   - Open the bet and stake YES or NO
   - Open a second browser tab, log in as a different user, and stake the opposite
   - Click "Trigger Resolve" to simulate the weather API call
   - See the auto-payout and weather proof

### Optional: Real Weather Data

To use real weather API data instead of simulated:

1. Get a free API key from https://openweathermap.org/api
2. Open `server.js`
3. Replace `YOUR_API_KEY_HERE` with your actual key
4. Restart the server

---

## Smart Contract Explained

The file `contracts/bet_with_friends.rs` is the Rialo smart contract written in Rust targeting RISC-V. Key things it shows:

**Native HTTPS calls inside a smart contract:**
```rust
let response: HttpResponse = HttpClient::get(&api_url)
    .with_timeout(5000)
    .with_retries(3)
    .await_verified()?;
```
On any other chain, you would need Chainlink or a custom oracle for this. On Rialo, the chain itself makes the HTTP call and validators sign the response as proof.

**Scheduled auto-resolution (Reactive Transactions):**
```rust
Schedule::at(resolve_at, ReactiveTx::Resolve { bet_id: bet.id })?;
```
No cron jobs. No keeper bots. The chain itself triggers the resolve function at the specified time.

**Native notifications:**
```rust
Notify::send(&winner.user, &format!("You won {} tokens!", share))?;
```
The smart contract sends messages directly to users via email/SMS/device ID. No backend needed.

**Social identity login:**
```rust
let display = staker.identity().display_name();
```
Users are identified by email/social accounts, not wallet addresses.

---

## How It Works (Flow)

```
1. Alice creates bet: "Will it rain tomorrow in NYC?"
   → Contract stores bet + schedules auto-resolve for tomorrow
   → Alice gets notified: "Your bet is live!"

2. Bob stakes 50 tokens on YES
   → Tokens move to escrow
   → Alice gets notified: "Bob staked 50 on YES"

3. Carol stakes 30 tokens on NO
   → Tokens move to escrow
   → Total pool: 80 tokens

4. Next day — chain auto-triggers resolve_bet()
   → Contract makes HTTPS call to OpenWeatherMap
   → API returns: "Rain" in NYC
   → Outcome: YES

5. Bob wins — gets 80 tokens (full pool)
   → Bob notified: "You won 80 tokens!"
   → Carol notified: "Better luck next time!"
   → Weather proof stored on-chain with validator signatures
```

---

## Rialo Resources for Builders

Read these to understand the tech deeply before applying for builder access:

### Core Concepts
- **Introducing Rialo**: https://www.rialo.io/posts/introducing-rialo
- **Reactive Transactions**: https://www.rialo.io/posts/reactive-transactions-a-model-for-native-automation-on-rialo
- **Prediction Markets on Rialo**: https://www.rialo.io/posts/how-rialo-secures-prediction-markets
- **Native Privacy**: https://www.rialo.io/posts/building-native-privacy-for-real-world-blockchain-adoption
- **Stake for Service**: https://www.rialo.io/posts/stake-for-service

### Architecture & Design
- **Supermodularity**: https://www.rialo.io/posts/supermodularity-and-system-welfare-the-economics-of-integration
- **Concurrency Control**: https://www.rialo.io/posts/a-visual-guide-to-concurrency-control
- **Double Marginalization**: https://www.rialo.io/posts/rialo-foundations-i-double-marginalization-in-crypto

### Interactive Learning
- **Rialo Learn (Demos)**: https://learn.rialo.io

### Community & Access
- **Discord**: https://discord.gg/RialoProtocol
- **Twitter/X**: https://x.com/RialoHQ
- **Telegram**: https://t.me/rialoprotocol
- **Devnet Waitlist**: https://www.rialo.io (scroll to bottom)
- **Careers at Subzero Labs**: https://jobs.ashbyhq.com/subzero

### Investor Context
- **Pantera Investment Thesis**: https://panteracapital.com/blog-investing-in-rialo/

---

## Tips for Getting the Builder Role

1. **Post this demo** in the Rialo Discord `#builders` or `#showcase` channel
2. **Record a 60-second demo video** showing the create→stake→resolve flow
3. **Explain in your post** why this project specifically needs Rialo (native web calls, reactive txs, no oracles)
4. **Mention you have the smart contract ready** to deploy once devnet access is granted
5. **Engage in the research channel** with technical analysis of their docs
6. **Join the waitlist** for devnet access at rialo.io

---

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (no framework, keeps it simple)
- **Backend**: Node.js + Express (simulates on-chain logic)
- **Smart Contract**: Rust targeting Rialo's RISC-V runtime
- **Data**: OpenWeatherMap API (real or simulated)

---

## License

MIT — built for the Rialo community.
