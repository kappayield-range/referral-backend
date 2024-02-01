import mongoose from 'mongoose';
import { UserModel } from './model/model'; // Import the UserModel from your models file
import dotenv from 'dotenv';


// Load environment variables from .env file
dotenv.config();

mongoose.connect(process.env.MONGODB_URI!);

// Function to convert Map to Object
function mapToObject(map: Map<any, any>): Record<string, any> {
    const out: Record<string, any> = {};
    map.forEach((value, key) => {
        if (value instanceof Map) {
            out[key] = mapToObject(value);
        } else {
            out[key] = value;
        }
    });
    return out;
}

function normalizeData(data: any): any {
    if (Array.isArray(data)) {
        return data.map(item => normalizeData(item));
    } else if (data instanceof Map) {
        return mapToObject(data);
    } else if (typeof data === 'object' && data !== null) {
        const newData: Record<string, any> = {};
        for (const key in data) {
            // Skip unnecessary fields (add any additional fields if needed)
            if (key === '_id' || key === '__v') continue;

            newData[key] = normalizeData(data[key]);
        }
        return newData;
    } else {
        return data;
    }
}


// Insert dummy users into the database and retrieve them for comparison
async function insertAndRetrieveDummyUsers() {
    const users: any = generateDummyData();
    console.log(JSON.stringify(users));
    try {
        await UserModel.insertMany(users);
        console.log('Dummy users inserted successfully');
        // Retrieve inserted users
        const retrievedUsers = await UserModel.find({}).lean();

        // Normalize both sets of data for comparison
        const normalizedInsertedUsers = normalizeData(users);
        const normalizedRetrievedUsers = normalizeData(retrievedUsers);
        console.log(JSON.stringify(normalizedInsertedUsers))
        console.log(JSON.stringify(normalizedRetrievedUsers))

        // Compare the data
        if (JSON.stringify(normalizedInsertedUsers) === JSON.stringify(normalizedRetrievedUsers)) {
            console.log('Retrieved data matches the inserted data');
        } else {
            console.log('Retrieved data does not match the inserted data');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.connection.close();
    }
}

function generateDummyData(): any[] {
    const users: any[] = [];
    const guardianAddress = "0x90140402f7a110fff86e211df16b20ace22d9b12";
    const referralAddress = "0x0c9231a1132740b933ef866e07cf15219260203e";
    const assets = ["0x912CE59144191C1204E64559FE8253a0e49E6548", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"];
    
    // Function to generate epoch timestamps for 12 AM of the past few days
    const generateTimestamps = (numberOfDays: number): string[] => {
        let timestamps: string[] = [];
        for (let i = 0; i < numberOfDays; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0); // Set to 12 AM
            timestamps.push(Math.floor(date.getTime() / 1000).toString()); // Convert to epoch timestamp
        }
        return timestamps;
    };

    const timestamps = generateTimestamps(5); // Generate epoch timestamps for the past 5 days

    const user = {
        guardian_address: guardianAddress,
        referrer_code: `referrer0`,
        isReferrer: true,
        points: Math.floor(Math.random() * 100),
        earned_asset_by_day: new Map([
            [assets[0], new Map(
                timestamps.map(timestamp => [timestamp, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]])
            )]
        ]),
        tvl_by_day: new Map([
            [assets[1], new Map(
                timestamps.map(timestamp => [timestamp, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]])
            )]
        ]),
        referrals: [{
            referral_address: referralAddress,
            referrer_code: `code0`,
            points_earned: Math.floor(Math.random() * 50),
            tvl_by_day: new Map([
                [assets[0], new Map(
                    timestamps.map(timestamp => [timestamp, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]])
                )]
            ])
        }]
    };

    users.push(user);

    return users;
}


insertAndRetrieveDummyUsers();
