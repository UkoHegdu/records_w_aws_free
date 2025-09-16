import React, { useState, useEffect } from 'react';
import { Settings, Users, MapPin, Bell, Shield, X, RefreshCw } from 'lucide-react';
import apiClient from '../auth';

interface ConfigValue {
    config_key: string;
    config_value: string;
    description: string;
}

interface User {
    id: number;
    username: string;
    tm_username: string;
    email: string;
    created_at: string;
    alert_type: string;
    map_count: number;
    alert_created_at: string;
}

const Admin: React.FC = () => {
    const [configs, setConfigs] = useState<ConfigValue[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    // const [loading, setLoading] = useState(true); // Unused for now
    const [usersLoading, setUsersLoading] = useState(false);
    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // Load configuration values
    useEffect(() => {
        loadConfigs();
        loadUsers();
    }, []);

    const loadConfigs = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            const response = await apiClient.get('/api/v1/admin/config');
            const data = response.data;
            setConfigs(data.configs);
        } catch (error) {
            console.error('Error loading configs:', error);
            // Fallback to mock data if API fails
            const mockConfigs: ConfigValue[] = [
                { config_key: 'max_maps_per_user', config_value: '200', description: 'Maximum number of maps a user can add to their watch list' },
                { config_key: 'max_driver_notifications', config_value: '200', description: 'Maximum number of driver notifications per user (optimized with position API)' },
                { config_key: 'max_users_registration', config_value: '100', description: 'Maximum number of users that can register on the site' },
                { config_key: 'max_new_records_per_map', config_value: '20', description: 'Maximum new records per map before truncating in email' }
            ];
            setConfigs(mockConfigs);
        }
    };

    const loadUsers = async () => {
        try {
            setUsersLoading(true);
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            const response = await apiClient.get('/api/v1/admin/users');
            const data = response.data;
            setUsers(data.users);
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setUsersLoading(false);
        }
    };

    const getConfigValue = (key: string): string => {
        const config = configs.find(c => c.config_key === key);
        return config?.config_value || '0';
    };

    const openModal = (configKey: string) => {
        setActiveModal(configKey);
        setEditValue(getConfigValue(configKey));
    };

    const closeModal = () => {
        setActiveModal(null);
        setEditValue('');
    };

    const saveConfig = async (configKey: string) => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            await apiClient.put('/api/v1/admin/config', {
                config_key: configKey,
                config_value: editValue
            });

            // Update local state with the saved config
            setConfigs(prev => prev.map(config =>
                config.config_key === configKey
                    ? { ...config, config_value: editValue }
                    : config
            ));

            closeModal();

            // Show success message
            alert(`Configuration updated successfully!`);
        } catch (error) {
            console.error('Error saving config:', error);
            alert(`Error saving configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const updateUserAlertType = async (userId: number, alertType: string) => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                console.error('No access token found');
                return;
            }

            await apiClient.put('/api/v1/admin/users/alert-type', {
                user_id: userId,
                alert_type: alertType
            });

            // Update local state
            setUsers(prev => prev.map(user =>
                user.id === userId
                    ? { ...user, alert_type: alertType }
                    : user
            ));

            alert(`User alert type updated to ${alertType}!`);
        } catch (error) {
            console.error('Error updating user alert type:', error);
            alert(`Error updating user alert type: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const ConfigModal: React.FC<{ configKey: string; title: string; description: string }> = ({ configKey, title, description }) => (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-card p-6 rounded-xl shadow-lg max-w-md w-full mx-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-foreground">{title}</h3>
                    <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                        <X size={24} />
                    </button>
                </div>

                <p className="text-muted-foreground mb-4">{description}</p>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-foreground mb-2">
                        Current Value:
                        <span className="ml-2">{getConfigValue(configKey)}</span>
                    </label>
                    <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        min="1"
                        max="1000"
                        placeholder="Enter new value"
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => saveConfig(configKey)}
                        className="btn-racing flex-1"
                    >
                        Save Changes
                    </button>
                    <button
                        onClick={closeModal}
                        className="px-4 py-2 bg-muted text-muted-foreground rounded-xl hover:bg-muted/80 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-gradient-to-br from-primary to-primary-glow rounded-xl shadow-glow">
                        <Settings className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Admin Configuration</h1>
                        <p className="text-muted-foreground">Manage system settings and user limits</p>
                    </div>
                </div>

                {/* Configuration Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* User Limits Configuration */}
                    <div className="racing-card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                                <Users className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground">User Limits</h2>
                        </div>
                        <p className="text-muted-foreground mb-4">
                            Configure maximum limits for user registrations and map additions.
                        </p>
                        <button
                            onClick={() => openModal('max_users_registration')}
                            className="btn-racing w-full flex items-center justify-center gap-2"
                        >
                            <Settings size={20} />
                            Configure
                        </button>
                    </div>

                    {/* Map Limits Configuration */}
                    <div className="racing-card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-br from-green-500 to-green-600 rounded-lg">
                                <MapPin className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground">Map Limits</h2>
                        </div>
                        <p className="text-muted-foreground mb-4">
                            Set maximum number of maps users can add to their watch lists.
                        </p>
                        <button
                            onClick={() => openModal('max_maps_per_user')}
                            className="btn-racing w-full flex items-center justify-center gap-2"
                        >
                            <Settings size={20} />
                            Configure
                        </button>
                    </div>

                    {/* Notification Limits Configuration */}
                    <div className="racing-card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg">
                                <Bell className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground">Notification Limits</h2>
                        </div>
                        <p className="text-muted-foreground mb-4">
                            Configure driver notification limits and email settings.
                        </p>
                        <button
                            onClick={() => openModal('max_driver_notifications')}
                            className="btn-racing w-full flex items-center justify-center gap-2"
                        >
                            <Settings size={20} />
                            Configure
                        </button>
                    </div>

                    {/* Popularity Limits Configuration */}
                    <div className="racing-card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-br from-red-500 to-red-600 rounded-lg">
                                <Shield className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold text-foreground">Popularity Limits</h2>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            Configure limits for popular maps to prevent email spam and API overload.
                        </p>
                        <button
                            onClick={() => openModal('max_new_records_per_map')}
                            className="btn-racing w-full flex items-center justify-center gap-2"
                        >
                            <Settings size={20} />
                            Configure
                        </button>
                    </div>


                </div>

                {/* API Usage Information */}
                <div className="racing-card mt-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg">
                            <Shield className="w-5 h-5 text-white" />
                        </div>
                        <h2 className="text-xl font-semibold text-foreground">API Usage & Limits</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="text-lg font-semibold text-foreground mb-3">Current Limits</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Max Maps per User:</span>
                                    <span className="text-foreground font-medium">200</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Max Driver Notifications:</span>
                                    <span className="text-foreground font-medium">200</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Max Users:</span>
                                    <span className="text-foreground font-medium">100</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">API Rate Limit:</span>
                                    <span className="text-foreground font-medium">2 req/sec</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Processing Mode:</span>
                                    <span className="text-green-600 font-medium">Sequential</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Max Records per Map:</span>
                                    <span className="text-foreground font-medium">20</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-foreground mb-3">Usage Projection</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Daily API Calls:</span>
                                    <span className="text-foreground font-medium">2,400</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Processing Time:</span>
                                    <span className="text-foreground font-medium">20 minutes</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Monthly API Calls:</span>
                                    <span className="text-foreground font-medium">72,000</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">API Rate Limit:</span>
                                    <span className="text-green-600 font-medium">2 req/sec (Sequential)</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Lambda Timeout Risk:</span>
                                    <span className="text-green-600 font-medium">Safe (45x margin)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Users Section */}
            <div className="bg-card rounded-xl shadow-sm border p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Users size={24} />
                        Users
                    </h2>
                    <button
                        onClick={loadUsers}
                        disabled={usersLoading}
                        className="btn-racing flex items-center gap-2"
                    >
                        <RefreshCw size={16} className={usersLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                </div>

                {usersLoading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border">
                                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Username</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">TM Username</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Maps</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Alert Type</th>
                                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id} className="border-b border-border hover:bg-muted/50">
                                        <td className="py-3 px-4 text-sm text-foreground">{user.username}</td>
                                        <td className="py-3 px-4 text-sm text-muted-foreground">{user.tm_username || 'Not set'}</td>
                                        <td className="py-3 px-4 text-sm text-foreground">{user.map_count}</td>
                                        <td className="py-3 px-4 text-sm">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.alert_type === 'accurate'
                                                ? 'bg-green-100 text-green-800'
                                                : user.alert_type === 'inaccurate'
                                                    ? 'bg-yellow-100 text-yellow-800'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {user.alert_type === 'none' ? 'No alerts' : user.alert_type}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-sm">
                                            {user.alert_type !== 'none' && (
                                                <div className="flex gap-2">
                                                    {user.alert_type === 'accurate' ? (
                                                        <button
                                                            onClick={() => updateUserAlertType(user.id, 'inaccurate')}
                                                            className="px-3 py-1 bg-yellow-500 text-white rounded text-xs hover:bg-yellow-600"
                                                        >
                                                            Switch to Inaccurate
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => updateUserAlertType(user.id, 'accurate')}
                                                            className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600"
                                                        >
                                                            Switch to Accurate
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {users.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                No users found
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Configuration Modals */}
            {activeModal === 'max_maps_per_user' && (
                <ConfigModal
                    configKey="max_maps_per_user"
                    title="Configure Map Limits"
                    description="Set the maximum number of maps each user can add to their watch list. Higher values increase processing time but allow more maps per user."
                />
            )}

            {activeModal === 'max_driver_notifications' && (
                <ConfigModal
                    configKey="max_driver_notifications"
                    title="Configure Driver Notification Limits"
                    description="Set the maximum number of driver notifications each user can have. This affects how many maps users can track for driver notifications."
                />
            )}

            {activeModal === 'max_users_registration' && (
                <ConfigModal
                    configKey="max_users_registration"
                    title="Configure User Registration Limits"
                    description="Set the maximum number of users that can register on the site. This helps control system load and API usage."
                />
            )}

            {activeModal === 'max_new_records_per_map' && (
                <ConfigModal
                    configKey="max_new_records_per_map"
                    title="Configure Popularity Limits"
                    description="Set the maximum number of new records per map before truncating in emails. This prevents email spam from viral maps."
                />
            )}


        </div>
    );
};

export default Admin;
