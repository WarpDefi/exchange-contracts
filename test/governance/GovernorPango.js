const { smock } = require("@defi-wonderland/smock");
const chai = require("chai");
const { ethers, network } = require("hardhat");

chai.use(smock.matchers);
const { expect } = chai;


describe("GovernorWarpDefi", function () {

    // Signers
    let signerA, signerB, signerC;
    // Factories
    let GovernorWarpDefi;
    // Contracts
    let governorWarpDefi, _timelock, _warpdefiStakingPositions;

    const PROPOSAL_THRESHOLD = ethers.utils.parseUnits('1000000', 18);
    const PROPOSAL_THRESHOLD_MIN = ethers.utils.parseUnits('500000', 18);
    const PROPOSAL_THRESHOLD_MAX = ethers.utils.parseUnits('50000000', 18);

    // Timelock hardcoded defaults
    const TIMELOCK_GRACE_PERIOD = ethers.utils.parseUnits((86_400 * 14).toString(), 0);
    const TIMELOCK_DELAY = ethers.utils.parseUnits((86_400 * 2).toString(), 0);

    // GovernorWarpDefi hardcoded defaults
    const VOTING_DELAY = ethers.utils.parseUnits((86_400).toString(), 0);
    const VOTING_DELAY_MIN = ethers.utils.parseUnits((86_400).toString(), 0);
    const VOTING_DELAY_MAX = ethers.utils.parseUnits((86_400 * 7).toString(), 0);
    const VOTING_PERIOD = ethers.utils.parseUnits((86_400 * 3).toString(), 0);
    const VOTING_PERIOD_MIN = ethers.utils.parseUnits((86_400 * 3).toString(), 0);
    const VOTING_PERIOD_MAX = ethers.utils.parseUnits((86_400 * 30).toString(), 0);
    const PROPOSAL_LIFECYCLE_TIME = VOTING_DELAY.add(VOTING_PERIOD).add(TIMELOCK_DELAY);

    before(async function () {
        [ signerA, signerB, signerC ] = await ethers.getSigners();

        // get contract factories
        GovernorWarpDefi = await ethers.getContractFactory("GovernorWarpDefi");
    });

    beforeEach(async function () {
        _timelock = await smock.fake("Timelock");
        _timelock.GRACE_PERIOD.returns(TIMELOCK_GRACE_PERIOD);
        _timelock.delay.returns(TIMELOCK_DELAY);
        _timelock.queuedTransactions.returns(false);

        _warpdefiStakingPositions = await smock.fake("WarpDefiStakingPositions");

        governorWarpDefi = await GovernorWarpDefi.deploy(
            _timelock.address,
            _warpdefiStakingPositions.address,
            PROPOSAL_THRESHOLD,
            PROPOSAL_THRESHOLD_MIN,
            PROPOSAL_THRESHOLD_MAX,
        );
        await governorWarpDefi.deployed();
    });

    describe("Constructor", function () {
        it("stores timelock", async function () {
            expect(await governorWarpDefi.TIMELOCK()).to.equal(_timelock.address);
        });
        it("stores warpdefi staking positions", async function () {
            expect(await governorWarpDefi.WARPDEFI_STAKING_POSITIONS()).to.equal(_warpdefiStakingPositions.address);
        });
        it("stores proposal threshold", async function () {
            expect(await governorWarpDefi.PROPOSAL_THRESHOLD()).to.equal(PROPOSAL_THRESHOLD);
        });
        it("stores proposal threshold min", async function () {
            expect(await governorWarpDefi.PROPOSAL_THRESHOLD_MIN()).to.equal(PROPOSAL_THRESHOLD_MIN);
        });
        it("stores proposal threshold max", async function () {
            expect(await governorWarpDefi.PROPOSAL_THRESHOLD_MAX()).to.equal(PROPOSAL_THRESHOLD_MAX);
        });
        it("invalid proposal threshold range", async function () {
            await expect(GovernorWarpDefi.deploy(
                _timelock.address,
                _warpdefiStakingPositions.address,
                PROPOSAL_THRESHOLD,
                PROPOSAL_THRESHOLD_MAX,
                PROPOSAL_THRESHOLD_MIN
            )).to.be.revertedWith('InvalidAction()');
        });
        it("proposal threshold below range", async function () {
            await expect(GovernorWarpDefi.deploy(
                _timelock.address,
                _warpdefiStakingPositions.address,
                PROPOSAL_THRESHOLD_MIN.sub(1),
                PROPOSAL_THRESHOLD_MIN,
                PROPOSAL_THRESHOLD_MAX
            )).to.be.revertedWith('InvalidAction()');
        });
        it("proposal threshold above range", async function () {
            await expect(GovernorWarpDefi.deploy(
                _timelock.address,
                _warpdefiStakingPositions.address,
                PROPOSAL_THRESHOLD_MAX.add(1),
                PROPOSAL_THRESHOLD_MIN,
                PROPOSAL_THRESHOLD_MAX
            )).to.be.revertedWith('InvalidAction()');
        });
    });

    describe("Propose", function () {
        const PROPOSER_NFT_ID = 1;
        let PROPOSAL_ARGS;

        beforeEach(async function () {
            PROPOSAL_ARGS = [
                [governorWarpDefi.address],
                [0],
                ['__setProposalThreshold(uint96)'],
                [ethers.utils.defaultAbiCoder.encode(['uint96'], [PROPOSAL_THRESHOLD.add(1)])],
                'This is a proposal',
                PROPOSER_NFT_ID
            ];

            _warpdefiStakingPositions.ownerOf.whenCalledWith(PROPOSER_NFT_ID).returns(signerA.address);
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition());
        });

        it("cannot propose without owning the NFT", async function() {
            _warpdefiStakingPositions.ownerOf.whenCalledWith(PROPOSER_NFT_ID).returns(ethers.constants.AddressZero);

            await expect(governorWarpDefi.propose(...PROPOSAL_ARGS)).to.be.revertedWith('InvalidOwner()');
        });

        it("cannot use a recently updated NFT", async function() {
            const block = await ethers.provider.getBlock('latest');
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: block.timestamp - PROPOSAL_LIFECYCLE_TIME.toNumber() + 1,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            await expect(governorWarpDefi.propose(...PROPOSAL_ARGS)).to.be.revertedWith('InsufficientVotes()');
        });

        it("must have enough votes", async function() {
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD.sub(1),
                },
            }));

            await expect(governorWarpDefi.propose(...PROPOSAL_ARGS)).to.be.revertedWith('InsufficientVotes()');
        });

        it("can create a proposal", async function() {
            const block = await ethers.provider.getBlock('latest');
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: block.timestamp - PROPOSAL_LIFECYCLE_TIME,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            await expect(governorWarpDefi.propose(...PROPOSAL_ARGS)).to.emit(governorWarpDefi, 'ProposalCreated');

            expect(await governorWarpDefi.proposalCount()).to.equal(1);

            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.proposer).to.equal(PROPOSER_NFT_ID);
            expect(proposal.forVotes).to.equal(0);
            expect(proposal.againstVotes).to.equal(0);
            expect(proposal.endTime).to.equal(proposal.startTime + VOTING_PERIOD.toNumber());
            expect(proposal.eta).to.equal(0);
            expect(proposal.executed).to.be.false;
            expect(proposal.canceled).to.be.false;

            const action = await governorWarpDefi.getActions(1);
            expect(action[0][0]).to.equal(PROPOSAL_ARGS[0][0]);
            expect(action[1][0]).to.equal(PROPOSAL_ARGS[1][0]);
            expect(action[2][0]).to.equal(PROPOSAL_ARGS[2][0]);
            expect(action[3][0]).to.equal(PROPOSAL_ARGS[3][0]);
        });
    });

    describe("Cancel", function () {
        const NFT_ID = 1;
        let VOTING_PERIOD_BEGIN_TIMESTAMP;

        beforeEach(async function () {
            _warpdefiStakingPositions.ownerOf.whenCalledWith(NFT_ID).returns(signerA.address);
            _warpdefiStakingPositions.positions.whenCalledWith(NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            await governorWarpDefi.propose(
                [governorWarpDefi.address],
                [0],
                ['__setProposalThreshold(uint96)'],
                [ethers.utils.defaultAbiCoder.encode(['uint96'], [PROPOSAL_THRESHOLD.add(1)])],
                'This is a proposal',
                NFT_ID
            );

            const block = await ethers.provider.getBlock('latest');
            VOTING_PERIOD_BEGIN_TIMESTAMP = VOTING_DELAY.add(block.timestamp).add(1).toNumber();
        });

        it("owner of proposing NFT can cancel before voting begins", async function() {
            await expect(governorWarpDefi.cancel(1)).to.emit(governorWarpDefi, 'ProposalCanceled');
        });
        it("owner of proposing NFT cannot cancel after voting begins", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP + 1]);
            await expect(governorWarpDefi.cancel(1)).to.be.revertedWith('InvalidState');
        });
        it("anybody can cancel when vote power drops before voting begins", async function() {
            _warpdefiStakingPositions.positions.whenCalledWith(NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD.sub(1),
                },
            }));
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP - 1]);
            await expect(governorWarpDefi.connect(signerB).cancel(1)).to.emit(governorWarpDefi, 'ProposalCanceled');
        });
        it("anybody can cancel when vote power drops after voting begins", async function() {
            _warpdefiStakingPositions.positions.whenCalledWith(NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD.sub(1),
                },
            }));
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP + 1]);
            await expect(governorWarpDefi.connect(signerB).cancel(1)).to.emit(governorWarpDefi, 'ProposalCanceled');
        });
        it("cannot cancel an expired proposal", async function() {
            // Begin voting
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);

            // Vote yay
            await governorWarpDefi.castVote(1, true, NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP + VOTING_PERIOD.toNumber()]);

            // Queue
            await governorWarpDefi.queue(1);

            // Expire proposal
            const expirationTime = VOTING_PERIOD_BEGIN_TIMESTAMP + VOTING_PERIOD.add(TIMELOCK_DELAY).add(TIMELOCK_GRACE_PERIOD).toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [expirationTime]);

            await expect(governorWarpDefi.queue(1)).to.be.revertedWith('InvalidState()');
        });
    });

    describe("Vote", function () {
        const VOTER_NFT_ID = 2;
        let VOTING_PERIOD_BEGIN_TIMESTAMP;

        beforeEach(async function () {
            const PROPOSER_NFT_ID = 1;
            _warpdefiStakingPositions.ownerOf.whenCalledWith(PROPOSER_NFT_ID).returns(signerA.address);
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            await governorWarpDefi.propose(
                [governorWarpDefi.address],
                [0],
                ['__setProposalThreshold(uint96)'],
                [ethers.utils.defaultAbiCoder.encode(['uint96'], [PROPOSAL_THRESHOLD.add(1)])],
                'This is a proposal',
                PROPOSER_NFT_ID
            );

            _warpdefiStakingPositions.ownerOf.whenCalledWith(VOTER_NFT_ID).returns(signerB.address);
            _warpdefiStakingPositions.positions.whenCalledWith(VOTER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: 100,
                },
            }));

            const block = await ethers.provider.getBlock('latest');
            VOTING_PERIOD_BEGIN_TIMESTAMP = VOTING_DELAY.add(block.timestamp).add(1).toNumber();
        });

        it("can vote yay during voting period", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.emit(governorWarpDefi, 'VoteCast');
            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.forVotes).to.equal(100);
            expect(proposal.againstVotes).to.equal(0);
            const receipt = await governorWarpDefi.receipts(1, VOTER_NFT_ID);
            expect(receipt.hasVoted).to.be.true;
            expect(receipt.support).to.be.true;
            expect(receipt.votes).to.equal(100)
        });
        it("can vote nay during voting period", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, false, VOTER_NFT_ID)
            ).to.emit(governorWarpDefi, 'VoteCast');
            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.forVotes).to.equal(0);
            expect(proposal.againstVotes).to.equal(100);
            const receipt = await governorWarpDefi.receipts(1, VOTER_NFT_ID);
            expect(receipt.hasVoted).to.be.true;
            expect(receipt.support).to.be.false;
            expect(receipt.votes).to.equal(100);
        });
        it("cannot vote twice by voting again", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.emit(governorWarpDefi, 'VoteCast');
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('IllegalVote()');
        });
        it("cannot vote twice by switching NFT owners", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            // Vote from signerB
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.emit(governorWarpDefi, 'VoteCast');

            // Transfer to signerC
            _warpdefiStakingPositions.ownerOf.whenCalledWith(VOTER_NFT_ID).returns(signerC.address);

            // Vote from signerC
            await expect(
                governorWarpDefi.connect(signerC).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('IllegalVote()');
        });
        it("cannot vote twice by unwinding the NFT position", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            // Vote
            expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.emit(governorWarpDefi, 'VoteCast');

            // Move funds into NFT 3
            const NEW_NFT_ID = 3;
            _warpdefiStakingPositions.ownerOf.whenCalledWith(NEW_NFT_ID).returns(signerB.address);
            _warpdefiStakingPositions.positions.whenCalledWith(NEW_NFT_ID).returns(createPosition({
                lastUpdate: VOTING_PERIOD_BEGIN_TIMESTAMP,
                valueVariables: {
                    balance: 100,
                },
            }));

            // Vote with new NFT
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, NEW_NFT_ID)
            ).to.be.revertedWith('InsufficientVotes()');
        });
        it("cannot vote without owning the NFT", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);

            // Make NFT owned by signerC
            _warpdefiStakingPositions.ownerOf.whenCalledWith(VOTER_NFT_ID).returns(signerC.address);

            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('InvalidOwner()');
        });
        it("cannot vote with 0 voting power", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);

            // Remove voting power
            _warpdefiStakingPositions.positions.whenCalledWith(VOTER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: 0,
                },
            }));

            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('InsufficientVotes()');
        });
        it("cannot vote with NFT created after voting begins", async function() {
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);

            // Simulation freshly created NFT
            _warpdefiStakingPositions.positions.whenCalledWith(VOTER_NFT_ID).returns(createPosition({
                lastUpdate: VOTING_PERIOD_BEGIN_TIMESTAMP,
                valueVariables: {
                    balance: 100,
                },
            }));

            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('InsufficientVotes()');
        });
        it("cannot vote before voting begins", async function() {
            await expect(
                governorWarpDefi.connect(signerB).castVote(1, true, VOTER_NFT_ID)
            ).to.be.revertedWith('InvalidState()');
        });
    });

    describe("Queue", function () {
        const PROPOSER_NFT_ID = 1;
        let VOTING_PERIOD_END_TIMESTAMP;

        beforeEach(async function () {
            _warpdefiStakingPositions.ownerOf.whenCalledWith(PROPOSER_NFT_ID).returns(signerA.address);
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            await governorWarpDefi.propose(
                [governorWarpDefi.address],
                [0],
                ['__setProposalThreshold(uint96)'],
                [ethers.utils.defaultAbiCoder.encode(['uint96'], [PROPOSAL_THRESHOLD.add(1)])],
                'This is a proposal',
                PROPOSER_NFT_ID
            );

            const block = await ethers.provider.getBlock('latest');
            const VOTING_PERIOD_BEGIN_TIMESTAMP = VOTING_DELAY.add(block.timestamp).add(1).toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            VOTING_PERIOD_END_TIMESTAMP = VOTING_PERIOD_BEGIN_TIMESTAMP + VOTING_PERIOD.toNumber();
        });

        it("can queue a successful vote", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await expect(governorWarpDefi.queue(1)).to.emit(governorWarpDefi, 'ProposalQueued');

            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.eta).to.equal(VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber());
            expect(proposal.executed).to.equal(false);
            expect(proposal.canceled).to.equal(false);
        });
        it("cannot queue an proposal being voted on", async function() {
            await expect(governorWarpDefi.queue(1)).to.be.revertedWith('InvalidState()');
        });
        it("cannot queue an unsuccessful vote", async function() {
            // Vote nay
            await governorWarpDefi.castVote(1, false, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await expect(governorWarpDefi.queue(1)).to.be.revertedWith('InvalidState()');
        });
        it("cannot queue an expired proposal", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await expect(governorWarpDefi.queue(1)).to.emit(governorWarpDefi, 'ProposalQueued');

            // Expire proposal
            const expirationTime = VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber() + TIMELOCK_GRACE_PERIOD.toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [expirationTime]);

            await expect(governorWarpDefi.queue(1)).to.be.revertedWith('InvalidState()');
        });
    });

    describe("Execute", function () {
        const PROPOSER_NFT_ID = 1;
        let VOTING_PERIOD_BEGIN_TIMESTAMP;
        let VOTING_PERIOD_END_TIMESTAMP;

        let PROPOSAL_ARGS;

        beforeEach(async function () {
            _warpdefiStakingPositions.ownerOf.whenCalledWith(PROPOSER_NFT_ID).returns(signerA.address);
            _warpdefiStakingPositions.positions.whenCalledWith(PROPOSER_NFT_ID).returns(createPosition({
                lastUpdate: 0,
                valueVariables: {
                    balance: PROPOSAL_THRESHOLD,
                },
            }));

            PROPOSAL_ARGS = [
                [governorWarpDefi.address],
                [0],
                ['__setProposalThreshold(uint96)'],
                [ethers.utils.defaultAbiCoder.encode(['uint96'], [PROPOSAL_THRESHOLD.add(1)])],
                'This is a proposal',
                PROPOSER_NFT_ID
            ];

            await governorWarpDefi.propose(...PROPOSAL_ARGS);

            const block = await ethers.provider.getBlock('latest');
            VOTING_PERIOD_BEGIN_TIMESTAMP = VOTING_DELAY.add(block.timestamp).add(1).toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_BEGIN_TIMESTAMP]);
            VOTING_PERIOD_END_TIMESTAMP = VOTING_PERIOD_BEGIN_TIMESTAMP + VOTING_PERIOD.toNumber();
        });

        it("can execute a queued proposal", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await governorWarpDefi.queue(1);

            // Conclude queued period
            const etaTimestamp = VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [etaTimestamp]);

            // Execute
            await expect(governorWarpDefi.execute(1)).to.emit(governorWarpDefi, 'ProposalExecuted');
            await expect(_timelock.executeTransaction).to.have.been.calledOnceWith(
                PROPOSAL_ARGS[0][0], // target
                PROPOSAL_ARGS[1][0], // value
                PROPOSAL_ARGS[2][0], // signature
                PROPOSAL_ARGS[3][0], // calldata
                etaTimestamp,
            );

            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.executed).to.equal(true);
        });
        it("cannot execute a proposal twice", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await governorWarpDefi.queue(1);

            // Conclude queued period
            const etaTimestamp = VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [etaTimestamp]);

            // Execute
            await governorWarpDefi.execute(1);

            // Attempt execution again
            await expect(governorWarpDefi.execute(1)).to.be.revertedWith('InvalidState()');
            await expect(_timelock.executeTransaction).to.have.been.calledOnce;

            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.executed).to.equal(true);
        });
        it("cannot execute a proposal with execution error", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await governorWarpDefi.queue(1);

            // Conclude queued period
            const etaTimestamp = VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [etaTimestamp]);

            _timelock.executeTransaction.reverts();

            // Attempt execution
            await expect(governorWarpDefi.execute(1)).to.be.reverted;
            await expect(_timelock.executeTransaction).to.have.been.calledOnce;

            const proposal = await governorWarpDefi.proposals(1);
            expect(proposal.executed).to.equal(false);
        });
        it("cannot execute an active proposal", async function() {
            await expect(governorWarpDefi.execute(1)).to.be.revertedWith('InvalidState()');
            await expect(_timelock.executeTransaction).not.to.have.been.called;
        });
        it("cannot execute a successful proposal that has not been queued", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Attempt execution
            await expect(governorWarpDefi.execute(1)).to.be.revertedWith('InvalidState()');
            await expect(_timelock.executeTransaction).not.to.have.been.called;
        });
        it("cannot execute a defeated proposal", async function() {
            // Vote nay
            await governorWarpDefi.castVote(1, false, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Attempt execution
            await expect(governorWarpDefi.execute(1)).to.be.revertedWith('InvalidState()');
            await expect(_timelock.executeTransaction).not.to.have.been.called;
        });
        it("cannot execute an expired proposal", async function() {
            // Vote yay
            await governorWarpDefi.castVote(1, true, PROPOSER_NFT_ID);

            // Conclude voting period
            await network.provider.send("evm_setNextBlockTimestamp", [VOTING_PERIOD_END_TIMESTAMP]);

            // Queue
            await governorWarpDefi.queue(1);

            // Wait for proposal to expire
            const etaTimestamp = VOTING_PERIOD_END_TIMESTAMP + TIMELOCK_DELAY.toNumber();
            const expireTimestamp = etaTimestamp + TIMELOCK_GRACE_PERIOD.toNumber();
            await network.provider.send("evm_setNextBlockTimestamp", [expireTimestamp]);

            // Attempt execution
            await expect(governorWarpDefi.execute(1)).to.be.revertedWith('InvalidState()');
            await expect(_timelock.executeTransaction).not.to.have.been.called;
        });
    });

    describe("Proposal threshold", function() {
        beforeEach(async function() {
            // fund the timelock for fake txs
            await signerA.sendTransaction({
                to: _timelock.address,
                value: ethers.utils.parseEther("1"),
            });
        });
        it("can be set to the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setProposalThreshold(PROPOSAL_THRESHOLD_MIN)
            ).to.emit(governorWarpDefi, 'ProposalThresholdChanged');
            expect(await governorWarpDefi.PROPOSAL_THRESHOLD()).to.equal(PROPOSAL_THRESHOLD_MIN);
        });
        it("cannot be set below the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setProposalThreshold(PROPOSAL_THRESHOLD_MIN.sub(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("can be set to the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setProposalThreshold(PROPOSAL_THRESHOLD_MAX)
            ).to.emit(governorWarpDefi, 'ProposalThresholdChanged');
            expect(await governorWarpDefi.PROPOSAL_THRESHOLD()).to.equal(PROPOSAL_THRESHOLD_MAX);
        });
        it("cannot be set above the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setProposalThreshold(PROPOSAL_THRESHOLD_MAX.add(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("cannot be set from non-Timelock", async function() {
            await expect(
                governorWarpDefi.connect(signerB).__setProposalThreshold(PROPOSAL_THRESHOLD_MAX)
            ).to.be.revertedWith('InvalidAction()');
        });
    });

    describe("Voting delay", function() {
        beforeEach(async function() {
            // fund the timelock for fake txs
            await signerA.sendTransaction({
                to: _timelock.address,
                value: ethers.utils.parseEther("1"),
            });
        });
        it("can be set to the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingDelay(VOTING_DELAY_MIN)
            ).to.emit(governorWarpDefi, 'VotingDelayChanged');
            expect(await governorWarpDefi.VOTING_DELAY()).to.equal(VOTING_DELAY_MIN);
        });
        it("cannot be set below the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingDelay(VOTING_DELAY_MIN.sub(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("can be set to the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingDelay(VOTING_DELAY_MAX)
            ).to.emit(governorWarpDefi, 'VotingDelayChanged');
            expect(await governorWarpDefi.VOTING_DELAY()).to.equal(VOTING_DELAY_MAX);
        });
        it("cannot be set above the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingDelay(VOTING_DELAY_MAX.add(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("cannot be set from non-Timelock", async function() {
            await expect(
                governorWarpDefi.connect(signerB).__setVotingDelay(VOTING_DELAY_MAX)
            ).to.be.revertedWith('InvalidAction()');
        });
    });

    describe("Voting period", function() {
        beforeEach(async function() {
            // fund the timelock for fake txs
            await signerA.sendTransaction({
                to: _timelock.address,
                value: ethers.utils.parseEther("1"),
            });
        });
        it("can be set to the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingPeriod(VOTING_PERIOD_MIN)
            ).to.emit(governorWarpDefi, 'VotingPeriodChanged');
            expect(await governorWarpDefi.VOTING_PERIOD()).to.equal(VOTING_PERIOD_MIN);
        });
        it("cannot be set below the minimum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingPeriod(VOTING_PERIOD_MIN.sub(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("can be set to the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingPeriod(VOTING_PERIOD_MAX)
            ).to.emit(governorWarpDefi, 'VotingPeriodChanged');
            expect(await governorWarpDefi.VOTING_PERIOD()).to.equal(VOTING_PERIOD_MAX);
        });
        it("cannot be set above the maximum", async function() {
            await expect(
                governorWarpDefi.connect(_timelock.wallet).__setVotingPeriod(VOTING_PERIOD_MAX.add(1))
            ).to.be.revertedWith('InvalidAction()');
        });
        it("cannot be set from non-Timelock", async function() {
            await expect(
                governorWarpDefi.connect(signerB).__setVotingPeriod(VOTING_PERIOD_MAX)
            ).to.be.revertedWith('InvalidAction()');
        });
    });
});

function createPosition(position) {
    return {
        valueVariables: {
            balance: position?.valueVariables?.balance ?? 0,
            sumOfEntryTimes: position?.valueVariables?.sumOfEntryTimes ?? 0,
        },
        rewardSummationsPaid: {
            idealPosition: position?.rewardSummationsPaid?.idealPosition ?? 0,
            rewardPerValue: position?.rewardSummationsPaid?.rewardPerValue ?? 0,
        },
        previousValues: position?.previousValues ?? 0,
        lastUpdate: position?.lastUpdate ?? 0,
        lastDevaluation: position?.lastDevaluation ?? 0,
    };
}