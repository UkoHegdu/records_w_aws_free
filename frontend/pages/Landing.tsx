// File: /frontend/src/pages/Landing.tsx
import React from 'react';

const Landing: React.FC = () => {
    return (
        <div className="landing-page">
            <h1>📍 Welcome to Trackmania Record Tracker</h1>
            <p>
                This tool helps you track who has driven your maps and who has bested your times. Sometimes a streamer drives my shitmaps and I have missed their reaction to them. Or I have driven a WR and am interested to know if it is ever beaten (of course it is)
            </p>

            <p>You can:</p>
            <ul style={{ paddingLeft: '1.5rem' }}>
                <li>Set and manage alerts for when someone drives one of your maps.</li>
                <li>See the newest records on your maps, without setting any alerts.</li>
                <li>See, set and manage driver notifications, so you know when someone snatches your WR.</li>
            </ul>
            <p>
                The app is still in early development, so expect improvements and new features over time!
            </p>
        </div>
    );
};

export default Landing;
