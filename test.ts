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
    for (let i = 0; i < 5; i++) {
        const user = {
            referrer_code: `referrer${i}`,
            isReferrer: i % 2 === 0,
            points: Math.floor(Math.random() * 100),
            earned_asset_by_day: new Map([
                [`asset${i}`, new Map([
                    [`day${i}`, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]]
                ])]
            ]),
            tvl_by_day: new Map([
                [`asset${i}`, new Map([
                    [`day${i}`, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]]
                ])]
            ]),
            referrals: [{
                referral_address: `address${i}`,
                referrer_code: `code${i}`,
                points_earned: Math.floor(Math.random() * 50),
                tvl_by_day: new Map([
                    [`asset${i}`, new Map([
                        [`day${i}`, [{ absolute_value: Math.random() * 100, usd_value: Math.random() * 100 }]]
                    ])]
                ])
            }]
        };
        users.push(user);
    }
    return users;
}


insertAndRetrieveDummyUsers();
