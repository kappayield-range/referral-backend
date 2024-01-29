import { ethers } from 'ethers';
import axios from 'axios';
import { Contract, Provider } from 'ethers-multicall';
import { VAULT_ABI } from './ABI/VAULT_ABI.ts';
import { Referral, User } from './types/type.ts';

// Configurations
const vaultAddress = 'your_vault_contract_address';
const rpcUrl = 'your_rpc_url';

// Ethereum provider
const provider = new ethers.providers.JsonRpcProvider(rpcUrl);

// Vault contract
const vaultContract = new ethers.Contract(vaultAddress, VAULT_ABI, provider);



// Function to get the price in USD for a given token
async function getPriceInUSD(tokenAddress: string): Promise<number> {
    // Implement the logic to get price in USD for the given token
    return 0; // Placeholder return
}

// Function to get block number by timestamp
async function getBlockNumberByTimestamp(chain: string, timestamp: number): Promise<number> {
    const response = await axios.get(`https://coins.llama.fi/block/${chain}/${timestamp}`);
    return response.data.block;
}

// Function to generate timestamps for every 4 hours of the previous day
function generateTimestamps(): number[] {
    const timestamps: any[] = [];
    const now = new Date();
    now.setUTCDate(now.getUTCDate() - 1);
    now.setUTCHours(0, 0, 0, 0);

    for (let i = 0; i < 6; i++) {
        timestamps.push(Number(Math.floor((now.getTime() / 1000))));
        now.setUTCHours(now.getUTCHours() + 4);
    }

    return timestamps;
}


async function calculateGuardianPoints(guardianMap: Record<string, string[]>): Promise<User[]> {
    let guardiansWithScores: { guardian: User, T: number, k: number }[] = [];
    let token0 = await vaultContract.token0();
    let token1 = await vaultContract.token1();

    // Fetch token prices outside the block loop
    const token0Price = await getPriceInUSD(token0);
    const token1Price = await getPriceInUSD(token1);

    for (const [guardian_address, referral_addresses] of Object.entries(guardianMap)) {
        let referrals: Referral[] = referral_addresses.map(address => ({
            referral_address: address,
            referrer_code: '',
            points_earned: 0,
            tvl_by_day: {}
        }));

        const guardian: User = {
            referrer_code: '',
            isReferrer: true,
            points: 0,
            earned_asset_by_day: {},
            tvl_by_day: {},
            referrals: []
        };

        const timestamps = generateTimestamps();
        const blockNumbers = await Promise.all(timestamps.map(timestamp => getBlockNumberByTimestamp('arbitrum', timestamp)));

        let totalReferralUSD = 0;

        for (let block of blockNumbers) {
            const epochDayTimestamp = timestamps[0];
            const referralBalances = await Promise.all(referrals.map(referral => 
                vaultContract.getUnderlyingBalancesByShare(vaultContract.balanceOf(referral.referral_address), { blockTag: block })
            ));

            for (let i = 0; i < referrals.length; i++) {
                const balance = referralBalances[i];
                const referralToken0USD = token0Price * balance.amount0Current;
                const referralToken1USD = token1Price * balance.amount1Current;
            
                referrals[i].points_earned += (referralToken0USD + referralToken1USD) / 6;
            
                // Store or update the TVL for each referral for token0
                referrals[i].tvl_by_day[token0] = referrals[i].tvl_by_day[token0] || {};
                if (referrals[i].tvl_by_day[token0][epochDayTimestamp]) {
                    referrals[i].tvl_by_day[token0][epochDayTimestamp].absolute_value += balance.amount0Current / 6;
                    referrals[i].tvl_by_day[token0][epochDayTimestamp].usd_value += referralToken0USD / 6;
                } else {
                    referrals[i].tvl_by_day[token0][epochDayTimestamp] = {
                        absolute_value: balance.amount0Current / 6,
                        usd_value: referralToken0USD / 6
                    };
                }
            
                // Store or update the TVL for each referral for token1
                referrals[i].tvl_by_day[token1] = referrals[i].tvl_by_day[token1] || {};
                if (referrals[i].tvl_by_day[token1][epochDayTimestamp]) {
                    referrals[i].tvl_by_day[token1][epochDayTimestamp].absolute_value += balance.amount1Current / 6;
                    referrals[i].tvl_by_day[token1][epochDayTimestamp].usd_value += referralToken1USD / 6;
                } else {
                    referrals[i].tvl_by_day[token1][epochDayTimestamp] = {
                        absolute_value: balance.amount1Current / 6,
                        usd_value: referralToken1USD / 6
                    };
                }
            }
            

            const guardianBalance = await vaultContract.getUnderlyingBalancesByShare(vaultContract.balanceOf(guardian_address), { blockTag: block });
            const guardianToken0USD = token0Price * guardianBalance.amount0Current;
            const guardianToken1USD = token1Price * guardianBalance.amount1Current;
            guardian.points += (guardianToken0USD + guardianToken1USD) / 6;

            // Store the TVL for the guardian
            guardian.tvl_by_day[token0] = guardian.tvl_by_day[token0] || {};
            if (guardian.tvl_by_day[token0][epochDayTimestamp]) {
                guardian.tvl_by_day[token0][epochDayTimestamp].absolute_value += guardianBalance.amount0Current;
                guardian.tvl_by_day[token0][epochDayTimestamp].usd_value += guardianToken0USD;
            } else {
                guardian.tvl_by_day[token0][epochDayTimestamp] = {
                    absolute_value: guardianBalance.amount0Current,
                    usd_value: guardianToken0USD
                };
            }

            // Update the TVL for the guardian for token1
            guardian.tvl_by_day[token1] = guardian.tvl_by_day[token1] || {};
            if (guardian.tvl_by_day[token1][epochDayTimestamp]) {
                guardian.tvl_by_day[token1][epochDayTimestamp].absolute_value += guardianBalance.amount1Current;
                guardian.tvl_by_day[token1][epochDayTimestamp].usd_value += guardianToken1USD;
            } else {
                guardian.tvl_by_day[token1][epochDayTimestamp] = {
                    absolute_value: guardianBalance.amount1Current,
                    usd_value: guardianToken1USD
                };
            }

        }

        referrals.forEach(referral => totalReferralUSD += referral.points_earned);
        const q = guardian.points;
        const k = totalReferralUSD;
        const T = ((q * 10) + k) * 100;

        guardiansWithScores.push({ guardian: { ...guardian, referrals }, T, k });
    }

    // Sort guardians based on their score (T) in descending order and assign weight factors
    guardiansWithScores.sort((a, b) => b.T - a.T);
    const weightFactors = [1, 0.8, 0.6, 0.4, 0.2];
    
    guardiansWithScores.forEach((guardianWithScore, index) => {
        const weightFactor = weightFactors[index] || 0.2; // Assign 0.2 if more than 5 guardians
        guardianWithScore.guardian.referrals.forEach(referral => {
            const referralUSDValue = referral.points_earned;
            referral.points_earned = guardianWithScore.T * (referralUSDValue / guardianWithScore.k) * weightFactor;
        });
    });

    return guardiansWithScores.map(g => g.guardian);
}





async function calculatePioneerPoints(users: User[]): Promise<User[]> {
    const ethcallProvider = new Provider(provider);
    await ethcallProvider.init();

    const timestamps = generateTimestamps();
    const blockNumbers = await Promise.all(timestamps.map(timestamp => getBlockNumberByTimestamp('arbitrum', timestamp)));
    
    const vaultContractAddress = '0x...'; // Replace with your actual contract address
    const vaultContract = new Contract(vaultContractAddress, VAULT_ABI);

    const token0Call = vaultContract.token0();
    const token1Call = vaultContract.token1();
    const [token0Address, token1Address] = await ethcallProvider.all([token0Call, token1Call]);
    const token0PriceP = getPriceInUSD(token0Address);
    const token1PriceP = getPriceInUSD(token1Address);
    const [token0Price, token1Price] = await Promise.all([token0PriceP, token1PriceP]);

    for (let user of users) {
        user.totalUSD = 0;
    }

    for (let block of blockNumbers) {
        let calls: any[] = [];
        users.forEach(user => {
            calls.push(
                vaultContract.getUnderlyingBalancesByShare(vaultContract.balanceOf(user.address), { blockTag: block })
            );
        });

        const results = await ethcallProvider.all(calls);
        let resultIndex = 0;

        for (let user of users) {
            const balance = results[resultIndex++];
            const userToken0USD = token0Price * balance.amount0Current;
            const userToken1USD = token1Price * balance.amount1Current;
            user.totalUSD += (userToken0USD + userToken1USD) / 6;
        }
    }

    for (let user of users) {
        user.hasPioneerNFT = await checkPioneerNFT(user.address);
        user.points = user.hasPioneerNFT ? user.totalUSD * 15 : user.totalUSD * 6;
    }

    return users;
}



async function checkPioneerNFT(userAddress: string): Promise<boolean> {
    // Implement the logic to check if the user holds a PIONEER NFT
    return false; // Placeholder return
}


// calculateGuardianPoints().then(result => {
//     console.log('Calculation Result:', result);
// }).catch(error => {
//     console.error('Error in calculation:', error);
// });
