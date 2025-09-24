import React, { useState, useEffect, ReactNode } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import Sidebar from './components/Layout/sidebar';
import { isAdmin } from './auth';

// Import all pages
import Landing from './pages/Landing';
import MapperAlerts from './pages/MapperAlerts';
import MapperNews from './pages/MapperNews';
import DriverPage from './pages/DriverPage';
import Login from './pages/Login';
import Register from './pages/Register';
import Admin from './pages/Admin';
import Dashboard from './pages/Dashboard';

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

    const AdminRoute = ({ children }: { children: ReactNode }) => {
        if (!isLoggedIn) return <Navigate to="/login" />;
        if (!isAdmin()) return <Navigate to="/" />;
        return children;
    };

    return (
        <Router>
            <div className="min-h-screen bg-gradient-to-br from-background via-background to-card">
                <div className="flex">
                    <Sidebar isLoggedIn={isLoggedIn} onLogout={handleLogout} />

                    <main className="flex-1 min-h-screen">
                        <Routes>
                            <Route path="/" element={<Landing />} />
                            <Route path="/login" element={<Login setIsLoggedIn={setIsLoggedIn} />} />
                            <Route path="/register" element={<Register />} />
                            <Route
                                path="/MapperAlerts"
                                element={
                                    <PrivateRoute>
                                        <MapperAlerts />
                                    </PrivateRoute>
                                }
                            />
                            <Route
                                path="/MapperNews"
                                element={
                                    <AdminRoute>
                                        <MapperNews />
                                    </AdminRoute>
                                }
                            />
                            <Route
                                path="/DriverNotifications"
                                element={
                                    <PrivateRoute>
                                        <DriverPage />
                                    </PrivateRoute>
                                }
                            />
                            <Route
                                path="/Admin"
                                element={
                                    <AdminRoute>
                                        <Admin />
                                    </AdminRoute>
                                }
                            />
                            <Route
                                path="/Dashboard"
                                element={
                                    <AdminRoute>
                                        <Dashboard />
                                    </AdminRoute>
                                }
                            />
                        </Routes>
                    </main>
                </div>
            </div>
            <Toaster position="top-right" />
        </Router>
    );
};

export default App;