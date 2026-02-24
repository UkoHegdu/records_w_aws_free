import React from 'react';
import { isTestEnvironment, getEnvironmentDisplayName } from '../utils/environment';

const EnvironmentBanner: React.FC = () => {
    if (!isTestEnvironment()) {
        return null;
    }

    return (
        <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center py-2 px-4 z-50 shadow-lg">
            <div className="flex items-center justify-center gap-2">
                <span className="text-lg">🧪</span>
                <span className="font-bold text-sm">
                    {getEnvironmentDisplayName()} - Data may be inaccurate
                </span>
                <span className="text-lg">🧪</span>
            </div>
        </div>
    );
};

export default EnvironmentBanner;
