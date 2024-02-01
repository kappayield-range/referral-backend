import express, { Request, Response } from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bodyParser from 'body-parser';
import { UserModel, IUser, IAssetInfo } from './model/model'; // Update with the actual path
import dotenv from 'dotenv';
import { AssetInfo } from './types/type';
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection setup (update with your credentials and DB name)
mongoose.connect(process.env.MONGODB_URI!);

// Endpoint
app.get('/total-referral-earnings/:guardianAddress', async (req, res) => {
    try {
        const { guardianAddress } = req.params;
        const days = parseInt(req.query.days as string) || 7;

        const endDate = new Date();
        endDate.setHours(0, 0, 0, 0);
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        // Fetch user document
        const user = await UserModel.findOne({ 'guardian_address': guardianAddress });
        if (!user) {
            return res.status(404).send('User not found');
        }

        let earningsMap = new Map<string, number>();

        // Iterate over earned_asset_by_day
        user.earned_asset_by_day.forEach((assetDataMap, assetAddress) => {
            Object.entries(assetDataMap).forEach(([timestamp, assetInfoArray]) => {
                const dateKey = new Date(parseInt(timestamp) * 1000);
                
                if (isNaN(dateKey.getTime())) {
                    console.error(`Invalid timestamp: ${timestamp}`);
                    return;
                }
        
                let currentTotal = earningsMap.get(timestamp) || 0;
                assetInfoArray.forEach((assetInfo: { usd_value: number; }) => {
                    currentTotal += assetInfo.usd_value;
                });
                earningsMap.set(timestamp, currentTotal);
            });
        });

        // Adjust startDate based on the earliest available data in earningsMap
        const earliestTimestamp = Math.min(...Array.from(earningsMap.keys()).map(t => parseInt(t)));
        const earliestDate = new Date(earliestTimestamp * 1000);
        if (startDate < earliestDate) {
            startDate.setTime(earliestDate.getTime());
        }

        // Convert startDate and endDate to Unix timestamps for key retrieval
        const startTimestamp = Math.floor(startDate.getTime() / 1000);
        const endTimestamp = Math.floor(endDate.getTime() / 1000);

        // Calculate percentage change
        const startValue = earningsMap.get(startTimestamp.toString()) || 0;
        const endValue = earningsMap.get(endTimestamp.toString()) || 0;
        let change = 0;
        if (startValue !== 0) {
            change = ((endValue - startValue) / startValue) * 100;
        }        

        // Convert Map to Array
        let data = Array.from(earningsMap).map(([date, amount]) => ({
            amount: amount,
            timestamp: date
        }));

        res.json({
            change: change.toFixed(2) + '%',
            data: data
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/earning-by-asset/:guardianAddress', async (req: Request, res: Response) => {
    try {
        const { guardianAddress } = req.params;

        // Fetch user document
        const user: IUser | null = await UserModel.findOne({ 'guardian_address': guardianAddress });
        if (!user) {
            return res.status(404).send('User not found');
        }

        // Initialize map to store aggregated asset data
        let assetAggregationMap = new Map<string, { amount: number, usdAmount: number }>();

        // Aggregate data
        user.earned_asset_by_day.forEach((assetDays, assetAddress) => {
            let currentAssetData = assetAggregationMap.get(assetAddress) || { amount: 0, usdAmount: 0 };

            Object.values(assetDays).forEach((dayData: unknown) => {
                // Check if dayData is an array before proceeding
                if (Array.isArray(dayData)) {
                    (dayData as AssetInfo[]).forEach(assetInfo => {
                        currentAssetData.amount += assetInfo.absolute_value;
                        currentAssetData.usdAmount += assetInfo.usd_value;
                    });
                }
            });

            assetAggregationMap.set(assetAddress, currentAssetData);
        });

        // Convert map to array
        let data = Array.from(assetAggregationMap).map(([address, assetData]) => ({
            address: address,
            amount: assetData.amount,
            usdAmount: assetData.usdAmount
        }));

        // Send response
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});




const otherFee = new Map<string, number>([
    // Example: ['assetAddress1', 100], ['assetAddress2', 200]
    // Add actual asset address and values here
]);


app.get('/earning-by-referrals/:guardianAddress', async (req: Request, res: Response) => {
    try {
        const { guardianAddress } = req.params;

        // Fetch guardian user document along with referrals
        const guardian: IUser | null = await UserModel.findOne({ guardian_address: guardianAddress }).populate('referrals');
        if (!guardian) {
            return res.status(404).send('Guardian not found');
        }

        // Function to get the latest TVL data
        const getLatestTVL = (tvlByDayMap: Map<string, Map<string, IAssetInfo[]>>) => {
            const latestEntry = Array.from(tvlByDayMap.entries()).pop();
            return latestEntry ? latestEntry[1] : new Map<string, IAssetInfo[]>();
        };

        // Get guardian's latest TVL data
        let guardianLatestTVL = getLatestTVL(guardian.tvl_by_day);
        let totalGuardianValue = new Map<string, number>();

        guardianLatestTVL.forEach((assetInfoArray, assetAddress) => {
            let totalValue = assetInfoArray.reduce((acc, asset) => acc + asset.absolute_value, 0);
            totalGuardianValue.set(assetAddress, totalValue);
        });

        // Calculate fees earned from each referral
        let feesEarned = guardian.referrals.map(referral => {
            let referralFee = 0;
            if (referral.tvl_by_day) {
                let referralLatestTVL = getLatestTVL(referral.tvl_by_day);
                referralLatestTVL.forEach((assetInfoArray, assetAddress) => {
                    let referralAssetValue = assetInfoArray.reduce((acc, asset) => acc + asset.absolute_value, 0);
                    let guardianAssetValue = totalGuardianValue.get(assetAddress) || 0;
                    let totalValue = referralAssetValue + guardianAssetValue;
                    let feeFactor = otherFee.get(assetAddress) || 0;

                    if (totalValue > 0) {
                        referralFee += (referralAssetValue / totalValue) * feeFactor;
                    }
                });
            }

            return { referralAddress: referral.referral_address, feeEarned: referralFee };
        });

        // Send response
        res.json(feesEarned);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});




const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
