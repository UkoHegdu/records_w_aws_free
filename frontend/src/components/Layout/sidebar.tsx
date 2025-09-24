import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    Home,
    Bell,
    Trophy,
    User,
    LogIn,
    LogOut,
    Flag,
    Settings,
    BarChart3
} from 'lucide-react';
import { clsx } from 'clsx';
import { isAdmin } from '../../auth';

interface SidebarProps {
    isLoggedIn: boolean;
    onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isLoggedIn, onLogout }) => {
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    const navigationItems = [
        { path: '/', icon: Home, label: 'Home', requiresAuth: false },
        ...(isLoggedIn ? [
            { path: '/MapperAlerts', icon: Bell, label: 'Mapper Alerts', requiresAuth: true },
            { path: '/DriverNotifications', icon: User, label: 'Driver Page', requiresAuth: true },
            ...(isAdmin() ? [
                { path: '/MapperNews', icon: Trophy, label: 'Newest Times', requiresAuth: true, adminOnly: true },
                { path: '/Dashboard', icon: BarChart3, label: 'Dashboard', requiresAuth: true, adminOnly: true },
                { path: '/Admin', icon: Settings, label: 'Admin', requiresAuth: true, adminOnly: true },
            ] : []),
        ] : [])
    ];

    const NavItem: React.FC<{
        path: string;
        icon: React.ElementType;
        label: string;
        isActive?: boolean;
        onClick?: () => void;
    }> = ({ path, icon: Icon, label, isActive: active, onClick }) => (
        <Link
            to={path}
            onClick={onClick}
            className={clsx(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                "hover:bg-primary/10 hover:transform hover:scale-105",
                active && "bg-primary/20 text-primary border border-primary/30"
            )}
        >
            <Icon size={20} />
            <span className="font-medium">{label}</span>
            {active && (
                <div className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
        </Link>
    );

    return (
        <aside className="w-72 min-h-screen bg-gradient-to-b from-card/80 to-background/80 backdrop-blur-xl border-r border-border/50">
            <div className="p-6">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-3 bg-gradient-to-br from-primary to-secondary-bright rounded-xl shadow-glow">
                        <Flag className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary-bright bg-clip-text text-transparent">
                            TrackMania
                        </h1>
                        <p className="text-sm text-muted-foreground">Records Tracker</p>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="space-y-2">
                    {navigationItems.map((item) => (
                        <NavItem
                            key={item.path}
                            path={item.path}
                            icon={item.icon}
                            label={item.label}
                            isActive={isActive(item.path)}
                        />
                    ))}
                </nav>

                {/* Auth Section */}
                <div className="mt-8 pt-6 border-t border-border/50">
                    {isLoggedIn ? (
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-left hover:bg-destructive/10 text-destructive transition-all duration-300 hover:transform hover:scale-105"
                        >
                            <LogOut size={20} />
                            <span className="font-medium">Log Out</span>
                        </button>
                    ) : (
                        <Link
                            to="/login"
                            className={clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                                "btn-racing text-center justify-center"
                            )}
                        >
                            <LogIn size={20} />
                            <span className="font-medium">Log In</span>
                        </Link>
                    )}
                </div>

                {/* Speed Lines Effect */}
                <div className="mt-8">
                    <div className="speed-lines h-2 rounded-full opacity-30" />
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;