import mongoose, { Schema, Document } from 'mongoose';

// AssetInfo Interface and Schema
interface IAssetInfo {
    absolute_value: number;
    usd_value: number;
}

const AssetInfoSchema = new Schema<IAssetInfo>({
    absolute_value: { type: Number, required: true },
    usd_value: { type: Number, required: true }
}, { _id: false });

// Referral Interface and Schema
interface IReferral {
    referral_address: string;
    referrer_code: string;
    points_earned: number;
    tvl_by_day: Map<string, Map<string, IAssetInfo[]>>;
}

const ReferralSchema = new Schema<IReferral>({
    referral_address: { type: String, required: true },
    referrer_code: { type: String, required: true },
    points_earned: { type: Number, required: true },
    tvl_by_day: {
        type: Map,
        of: mongoose.Schema.Types.Mixed // Mixed type for nested map
    }
});

// User Interface and Schema
interface IUser extends Document {
    guardian_address: string;
    referrer_code: string;
    isReferrer: boolean;
    points: number;
    earned_asset_by_day: Map<string, Map<string, IAssetInfo[]>>;
    tvl_by_day: Map<string, Map<string, IAssetInfo[]>>;
    referrals: IReferral[];
}

const UserSchema = new Schema<IUser>({
    guardian_address: { type: String, required: true, unique: true },
    referrer_code: { type: String, required: true, unique: true },
    isReferrer: { type: Boolean, required: true },
    points: { type: Number, required: true },
    earned_asset_by_day: {
        type: Map,
        of: mongoose.Schema.Types.Mixed // Mixed type for nested map
    },
    tvl_by_day: {
        type: Map,
        of: mongoose.Schema.Types.Mixed // Mixed type for nested map
    },
    referrals: [ReferralSchema]
});

const UserModel = mongoose.model<IUser>('User', UserSchema);

export { UserModel, IUser, IAssetInfo };
