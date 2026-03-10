use rialo_sdk::prelude::*;
use rialo_sdk::web::{HttpClient, HttpResponse};
use rialo_sdk::reactive::{Trigger, Schedule};
use rialo_sdk::identity::SocialIdentity;
use rialo_sdk::messaging::Notify;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Bet {
    pub id: u64,
    pub creator: Pubkey,
    pub question: String,
    pub category: BetCategory,
    pub resolve_config: ResolveConfig,
    pub stake_amount: u64,
    pub total_pool: u64,
    pub yes_stakers: Vec<Stake>,
    pub no_stakers: Vec<Stake>,
    pub status: BetStatus,
    pub outcome: Option<Outcome>,
    pub created_at: i64,
    pub resolve_at: i64,
    pub weather_proof: Option<WebCallProof>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct Stake {
    pub user: Pubkey,
    pub amount: u64,
    pub position: Position,
    pub timestamp: i64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct ResolveConfig {
    pub api_url: String,
    pub city: String,
    pub condition: WeatherCondition,
    pub threshold: Option<f64>,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum BetCategory { Weather, Sports, Crypto, Custom }

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum BetStatus { Open, Locked, Resolving, Resolved, Cancelled }

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum Position { Yes, No }

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum Outcome { Yes, No }

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum WeatherCondition { Rain, Temperature, Snow, Wind }

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct WebCallProof {
    pub url: String,
    pub response_hash: [u8; 32],
    pub timestamp: i64,
    pub validator_signatures: Vec<Signature>,
}

#[program]
pub mod bet_with_friends {
    use super::*;

    pub fn create_bet(
        ctx: Context<CreateBet>,
        question: String,
        category: BetCategory,
        resolve_config: ResolveConfig,
        stake_amount: u64,
        resolve_at: i64,
    ) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let creator = &ctx.accounts.creator;

        bet.id = ctx.accounts.counter.next_id();
        bet.creator = creator.key();
        bet.question = question;
        bet.category = category;
        bet.resolve_config = resolve_config;
        bet.stake_amount = stake_amount;
        bet.total_pool = 0;
        bet.yes_stakers = Vec::new();
        bet.no_stakers = Vec::new();
        bet.status = BetStatus::Open;
        bet.outcome = None;
        bet.created_at = Clock::get()?.unix_timestamp;
        bet.resolve_at = resolve_at;
        bet.weather_proof = None;

        Schedule::at(resolve_at, ReactiveTx::Resolve { bet_id: bet.id })?;

        Notify::send(
            &creator.identity(),
            &format!("Your bet '{}' is live! Share the link with friends.", question),
        )?;

        emit!(BetCreated {
            bet_id: bet.id,
            creator: creator.key(),
            question: bet.question.clone(),
            stake_amount,
            resolve_at,
        });

        Ok(())
    }

    pub fn place_stake(
        ctx: Context<PlaceStake>,
        position: Position,
        amount: u64,
    ) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        let staker = &ctx.accounts.staker;

        require!(bet.status == BetStatus::Open, BetError::BetNotOpen);
        require!(amount >= bet.stake_amount, BetError::StakeTooLow);

        let already_staked = bet.yes_stakers.iter().chain(bet.no_stakers.iter())
            .any(|s| s.user == staker.key());
        require!(!already_staked, BetError::AlreadyStaked);

        rialo_sdk::token::transfer(
            &staker,
            &ctx.accounts.escrow,
            amount,
        )?;

        let stake = Stake {
            user: staker.key(),
            amount,
            position: position.clone(),
            timestamp: Clock::get()?.unix_timestamp,
        };

        match position {
            Position::Yes => bet.yes_stakers.push(stake),
            Position::No => bet.no_stakers.push(stake),
        }

        bet.total_pool += amount;

        Notify::send(
            &bet.creator,
            &format!("{} staked {} on '{}'", staker.identity().display_name(), amount, bet.question),
        )?;

        emit!(StakePlaced {
            bet_id: bet.id,
            staker: staker.key(),
            position,
            amount,
        });

        Ok(())
    }

    #[reactive(trigger = Schedule)]
    pub fn resolve_bet(ctx: Context<ResolveBet>) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        require!(bet.status == BetStatus::Open, BetError::BetNotOpen);

        bet.status = BetStatus::Resolving;

        let api_url = format!(
            "https://api.openweathermap.org/data/2.5/weather?q={}&appid=CONTRACT_KEY&units=metric",
            bet.resolve_config.city
        );

        let response: HttpResponse = HttpClient::get(&api_url)
            .with_timeout(5000)
            .with_retries(3)
            .await_verified()?;

        let weather_data: serde_json::Value = response.json()?;

        bet.weather_proof = Some(WebCallProof {
            url: api_url,
            response_hash: response.content_hash(),
            timestamp: Clock::get()?.unix_timestamp,
            validator_signatures: response.validator_proofs(),
        });

        let outcome = match bet.resolve_config.condition {
            WeatherCondition::Rain => {
                let weather_id = weather_data["weather"][0]["id"].as_u64().unwrap_or(800);
                let rain_codes = [200..=232, 300..=321, 500..=531];
                if rain_codes.iter().any(|r| r.contains(&(weather_id as u32))) {
                    Outcome::Yes
                } else {
                    Outcome::No
                }
            }
            WeatherCondition::Temperature => {
                let temp = weather_data["main"]["temp"].as_f64().unwrap_or(0.0);
                let threshold = bet.resolve_config.threshold.unwrap_or(25.0);
                if temp > threshold { Outcome::Yes } else { Outcome::No }
            }
            WeatherCondition::Snow => {
                let weather_id = weather_data["weather"][0]["id"].as_u64().unwrap_or(800);
                if (600..=622).contains(&(weather_id as u32)) {
                    Outcome::Yes
                } else {
                    Outcome::No
                }
            }
            WeatherCondition::Wind => {
                let wind = weather_data["wind"]["speed"].as_f64().unwrap_or(0.0);
                let threshold = bet.resolve_config.threshold.unwrap_or(10.0);
                if wind > threshold { Outcome::Yes } else { Outcome::No }
            }
        };

        let winners = match outcome {
            Outcome::Yes => &bet.yes_stakers,
            Outcome::No => &bet.no_stakers,
        };

        let total_winner_stake: u64 = winners.iter().map(|s| s.amount).sum();

        if total_winner_stake > 0 {
            for winner in winners {
                let share = (winner.amount as u128 * bet.total_pool as u128 / total_winner_stake as u128) as u64;
                rialo_sdk::token::transfer(
                    &ctx.accounts.escrow,
                    &winner.user,
                    share,
                )?;

                Notify::send(
                    &winner.user,
                    &format!("You won {} tokens on '{}'!", share, bet.question),
                )?;
            }
        }

        let losers = match outcome {
            Outcome::Yes => &bet.no_stakers,
            Outcome::No => &bet.yes_stakers,
        };

        for loser in losers {
            Notify::send(
                &loser.user,
                &format!("Bet resolved: '{}'. Better luck next time!", bet.question),
            )?;
        }

        bet.status = BetStatus::Resolved;
        bet.outcome = Some(outcome.clone());

        emit!(BetResolved {
            bet_id: bet.id,
            outcome,
            total_pool: bet.total_pool,
            weather_proof: bet.weather_proof.clone(),
        });

        Ok(())
    }

    pub fn cancel_bet(ctx: Context<CancelBet>) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        require!(bet.creator == ctx.accounts.creator.key(), BetError::Unauthorized);
        require!(bet.status == BetStatus::Open, BetError::BetNotOpen);
        require!(bet.yes_stakers.is_empty() && bet.no_stakers.is_empty(), BetError::HasStakers);

        bet.status = BetStatus::Cancelled;

        emit!(BetCancelled { bet_id: bet.id });
        Ok(())
    }
}

#[event]
pub struct BetCreated {
    pub bet_id: u64,
    pub creator: Pubkey,
    pub question: String,
    pub stake_amount: u64,
    pub resolve_at: i64,
}

#[event]
pub struct StakePlaced {
    pub bet_id: u64,
    pub staker: Pubkey,
    pub position: Position,
    pub amount: u64,
}

#[event]
pub struct BetResolved {
    pub bet_id: u64,
    pub outcome: Outcome,
    pub total_pool: u64,
    pub weather_proof: Option<WebCallProof>,
}

#[event]
pub struct BetCancelled {
    pub bet_id: u64,
}

#[error_code]
pub enum BetError {
    #[msg("Bet is not open for staking")]
    BetNotOpen,
    #[msg("Stake amount too low")]
    StakeTooLow,
    #[msg("Already staked on this bet")]
    AlreadyStaked,
    #[msg("Not authorized")]
    Unauthorized,
    #[msg("Cannot cancel bet with active stakers")]
    HasStakers,
    #[msg("Weather API call failed")]
    WeatherApiFailed,
}
