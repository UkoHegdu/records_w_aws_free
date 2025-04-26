// File: /frontend/src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

import Landing from './pages/Landing';
import MapperAlerts from './pages/MapperAlerts';
import MapperNews from './pages/MapperNews';
import DriverPage from './pages/DriverPage';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <aside className="sidebar">
          <nav>
            <ul>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/MapperAlerts">Mapper Alerts</Link></li>
              <li><Link to="/MapperNews">Mapper Newest times</Link></li>
              <li><Link to="/DriverNotifications">Driver page</Link></li>
            </ul>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/MapperAlerts" element={<MapperAlerts />} />
            <Route path="/MapperNews" element={<MapperNews />} />
            <Route path="/DriverNotifications" element={<DriverPage />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;