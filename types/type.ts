export type Referral = {
    referral_address: string;
    referrer_code: string;
    points_earned: number;
    tvl_by_day: { [asset_address: string]: { [epoch_day: string]: AssetInfo } };
};

export type User = {
    referrer_code: string;
    isReferrer: boolean;
    points: number;
    earned_asset_by_day: { [asset_address: string]: { [epoch_day: string]: AssetInfo } };
    tvl_by_day: { [asset_address: string]: { [epoch_day: string]: AssetInfo } };
    referrals: Referral[];
};

export type AssetInfo = {
    absolute_value: number;
    usd_value: number;
};

export type ReferrerMap = User[];
