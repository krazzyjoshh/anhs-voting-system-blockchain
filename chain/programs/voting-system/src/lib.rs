use anchor_lang::prelude::*;

declare_id!("3qbabjuWYpbyWFaHfmW1qmjLWkWMJkDxZUbUVzRE8VXX");

pub const STATUS_PENDING: u8 = 0;
pub const STATUS_OPEN: u8 = 1;
pub const STATUS_CLOSED: u8 = 2;
pub const MAX_CANDIDATES: usize = 10;

#[program]
pub mod voting_system {
    use super::*;

    pub fn create_election(
        ctx: Context<CreateElection>,
        election_id: u64,
        title: String,
    ) -> Result<()> {
        require!(title.len() <= 64, VotingError::NameTooLong);
        let e = &mut ctx.accounts.election;
        e.authority = ctx.accounts.authority.key();
        e.title = title;
        e.status = STATUS_PENDING;
        e.position_count = 0;
        e.token_count = 0;
        let _ = election_id;
        Ok(())
    }

    pub fn add_position(
        ctx: Context<AddPosition>,
        name: String,
        candidates: Vec<String>,
    ) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(e.status == STATUS_PENDING, VotingError::ElectionLocked);
        require!(name.len() <= 32, VotingError::NameTooLong);
        require!(
            !candidates.is_empty() && candidates.len() <= MAX_CANDIDATES,
            VotingError::BadCandidateCount
        );
        for c in candidates.iter() {
            require!(c.len() <= 40, VotingError::NameTooLong);
        }

        let p = &mut ctx.accounts.position;
        p.election = e.key();
        p.index = e.position_count;
        p.name = name;
        p.votes = vec![0; candidates.len()];
        p.candidates = candidates;

        e.position_count += 1;
        Ok(())
    }

    pub fn register_token(ctx: Context<RegisterToken>, token_hash: [u8; 32]) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(e.status == STATUS_PENDING, VotingError::ElectionLocked);
        let _ = token_hash;
        ctx.accounts.token_record.votes_cast = 0;
        e.token_count += 1;
        Ok(())
    }

    pub fn set_status(ctx: Context<SetStatus>, status: u8) -> Result<()> {
        let e = &mut ctx.accounts.election;
        require!(
            status > e.status && status <= STATUS_CLOSED,
            VotingError::BadStatus
        );
        e.status = status;
        Ok(())
    }

    pub fn cast_vote(
        ctx: Context<CastVote>,
        token_hash: [u8; 32],
        candidate_index: u8,
    ) -> Result<()> {
        require!(
            ctx.accounts.election.status == STATUS_OPEN,
            VotingError::ElectionNotOpen
        );
        let p = &mut ctx.accounts.position;
        require!(
            (candidate_index as usize) < p.votes.len(),
            VotingError::InvalidOption
        );
        p.votes[candidate_index as usize] += 1;
        ctx.accounts.token_record.votes_cast += 1;
        let _ = token_hash;
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(election_id: u64)]
pub struct CreateElection<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + 64 + 1 + 1 + 4,
        seeds = [b"election", election_id.to_le_bytes().as_ref()],
        bump
    )]
    pub election: Account<'info, Election>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddPosition<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 1 + 4 + 32 + 4 + MAX_CANDIDATES * (4 + 40) + 4 + MAX_CANDIDATES * 8,
        seeds = [b"position", election.key().as_ref(), &[election.position_count]],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_hash: [u8; 32])]
pub struct RegisterToken<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(
        init,
        payer = authority,
        space = 8 + 1,
        seeds = [b"token", election.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub token_record: Account<'info, TokenRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetStatus<'info> {
    #[account(mut, has_one = authority)]
    pub election: Account<'info, Election>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(token_hash: [u8; 32])]
pub struct CastVote<'info> {
    #[account(has_one = authority)]
    pub election: Account<'info, Election>,
    #[account(mut, constraint = position.election == election.key())]
    pub position: Account<'info, Position>,
    // Kailangang naka-register ang token. Kung hindi, mag-e-error dito.
    #[account(
        mut,
        seeds = [b"token", election.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub token_record: Account<'info, TokenRecord>,
    // Isang boto kada token kada posisyon. Pag ulit, mag-e-error.
    #[account(
        init,
        payer = authority,
        space = 8 + 1,
        seeds = [b"vote", position.key().as_ref(), token_hash.as_ref()],
        bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Election {
    pub authority: Pubkey,
    pub title: String,
    pub status: u8,
    pub position_count: u8,
    pub token_count: u32,
}

#[account]
pub struct Position {
    pub election: Pubkey,
    pub index: u8,
    pub name: String,
    pub candidates: Vec<String>,
    pub votes: Vec<u64>,
}

#[account]
pub struct TokenRecord {
    pub votes_cast: u8,
}

#[account]
pub struct VoteRecord {
    pub placeholder: u8,
}

#[error_code]
pub enum VotingError {
    #[msg("Invalid option")]
    InvalidOption,
    #[msg("Election is not open")]
    ElectionNotOpen,
    #[msg("Election setup is locked")]
    ElectionLocked,
    #[msg("Invalid status change")]
    BadStatus,
    #[msg("Name is too long")]
    NameTooLong,
    #[msg("Candidates must be between 1 and 10")]
    BadCandidateCount,
}