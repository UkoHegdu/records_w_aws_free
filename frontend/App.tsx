// File: /frontend/src/App.tsx
import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import './App.css';

import Landing from './pages/Landing';
import MapperAlerts from './pages/MapperAlerts';
import MapperNews from './pages/MapperNews';
import DriverPage from './pages/DriverPage';
import Login from './pages/Login';
import Register from './pages/Register';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
  };

  const PrivateRoute = ({ children }: { children: ReactNode }) => {
    return isLoggedIn ? children : <Navigate to="/login" />;
  };

  return (
    <Router>
      <div className="app">
        <aside className="sidebar">
          <nav>
            <ul>
              <li><Link to="/">Home</Link></li>
              {isLoggedIn ? (
                <>
                  <li><Link to="/MapperAlerts">Mapper Alerts</Link></li>
                  <li><Link to="/MapperNews">Mapper Newest times</Link></li>
                  <li><Link to="/DriverNotifications">Driver page</Link></li>
                  <li style={{ marginTop: '2rem' }}>
                    <button onClick={handleLogout}>Log out</button>
                  </li>
                </>
              ) : (
                <li style={{ marginTop: '2rem' }}>
                  <Link to="/login">Log in</Link>
                </li>
              )}
            </ul>
          </nav>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/MapperAlerts" element={
              <PrivateRoute><MapperAlerts /></PrivateRoute>
            } />
            <Route path="/MapperNews" element={
              <PrivateRoute><MapperNews /></PrivateRoute>
            } />
            <Route path="/DriverNotifications" element={
              <PrivateRoute><DriverPage /></PrivateRoute>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
