import React, { useState } from 'react';
import axios from 'axios';

export default function App() {
  const [mapUid, setMapUid] = useState('');
  const [period, setPeriod] = useState('1d');
  const [result, setResult] = useState(null);

  const handleCheck = async () => {
    try {
      const res = await axios.get(`http://localhost:3000/api/v1/records/latest?mapUid=${mapUid}&period=${period}`);
      setResult(res.data);
    } catch (err) {
      setResult({ error: 'Something went wrong or no record found.' });
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-4 space-y-4">
        <h2 className="text-xl font-semibold mb-4">Navigation</h2>
        <ul className="space-y-2">
          <li>Newest Records</li>
          <li>Map Notifications</li>
          <li>Dethroned Notifications</li>
          <li>Your Times</li>
        </ul>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <h1 className="text-2xl font-bold mb-6">Newest records for your maps</h1>

        <div className="space-y-4 max-w-md">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Map UID</span>
            <input
              type="text"
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
              value={mapUid}
              onChange={(e) => setMapUid(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Time Range</span>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md p-2"
            >
              <option value="1d">1 Day</option>
              <option value="1w">1 Week</option>
              <option value="1m">1 Month</option>
            </select>
          </label>

          <button
            onClick={handleCheck}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Check
          </button>

          {result && (
            <div className="mt-4 bg-gray-100 p-4 rounded">
              {result.error ? (
                <p className="text-red-600">{result.error}</p>
              ) : (
                <pre>{JSON.stringify(result, null, 2)}</pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
