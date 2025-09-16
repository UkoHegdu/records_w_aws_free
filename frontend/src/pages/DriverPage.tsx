import React, { useState, useEffect } from 'react';
import { User, Trophy, Plus, Trash2, Target, MapPin, Search, X, ChevronRight, Settings } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../auth';

interface DriverNotification {
    id: string;
    mapUid: string;
    mapName: string;
    currentPosition: number;
    personalBest: number;
    personalBestFormatted: string;
    status: 'active' | 'inactive';
    createdAt: string;
    lastChecked?: string;
    isActive: boolean;
}

interface MapSearchResult {
    mapId: number;
    mapUid: string;
    name: string;
    authors: string[];
    medals: {
        author: number;
        gold: number;
        silver: number;
        bronze: number;
    } | null;
    uploadedAt: string;
    downloadCount: number;
}

interface SearchPagination {
    currentPage: number;
    pageSize: number;
    hasMore: boolean;
    totalResults: number;
}

const DriverPage: React.FC = () => {
    const [notifications, setNotifications] = useState<DriverNotification[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [mapName, setMapName] = useState('');
    const [mapUid, setMapUid] = useState('');
    const [searchResults, setSearchResults] = useState<MapSearchResult[]>([]);
    const [searchPagination, setSearchPagination] = useState<SearchPagination | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedMap, setSelectedMap] = useState<MapSearchResult | null>(null);
    const [showMapDetails, setShowMapDetails] = useState(false);
    const [isAddingNotification, setIsAddingNotification] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [showErrorDialog, setShowErrorDialog] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);
    const [dialogMessage, setDialogMessage] = useState('');
    const [activeTab, setActiveTab] = useState<'notifications' | 'info'>('notifications');
    const [showTmUsernameModal, setShowTmUsernameModal] = useState(false);
    const [tmUsername, setTmUsername] = useState('');
    const [isVerifyingTmUsername, setIsVerifyingTmUsername] = useState(false);
    const [tmUsernameStatus, setTmUsernameStatus] = useState<{ hasTmUsername: boolean, tmUsername?: string } | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    useEffect(() => {
        checkTmUsernameStatus();
        fetchNotifications();
    }, []);

    const checkTmUsernameStatus = async () => {
        try {
            const response = await apiClient.get('/api/v1/users/tm-username');
            setTmUsernameStatus(response.data);
        } catch (error: any) {
            console.error('Error checking TM username status:', error);
            // If error, assume no TM username set
            setTmUsernameStatus({ hasTmUsername: false });
        }
    };

    const handleVerifyTmUsername = async () => {
        if (!tmUsername.trim()) {
            toast.error('Please enter a Trackmania username');
            return;
        }

        setIsVerifyingTmUsername(true);
        try {
            const response = await apiClient.post('/api/v1/users/tm-username', {
                tmUsername: tmUsername.trim()
            });

            if (response.data.success) {
                setDialogMessage(`Trackmania username "${tmUsername}" verified and saved successfully!`);
                setShowSuccessDialog(true);
                setShowTmUsernameModal(false);
                setTmUsername('');
                checkTmUsernameStatus(); // Refresh status
            }
        } catch (error: any) {
            console.error('Error verifying TM username:', error);
            setDialogMessage(error.response?.data?.error || 'Failed to verify Trackmania username');
            setShowErrorDialog(true);
        } finally {
            setIsVerifyingTmUsername(false);
        }
    };

    const fetchNotifications = async () => {
        try {
            const response = await apiClient.get('/api/v1/driver/notifications');
            setNotifications(response.data.notifications || []);
        } catch (error: any) {
            console.error('Error fetching notifications:', error);
            // Only show error if it's not a 404 (no notifications) or network error
            if (error.response?.status !== 404 && error.code !== 'ERR_NETWORK') {
                toast.error('Failed to load driver notifications');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = async (page = 1) => {
        const query = mapName.trim() || mapUid.trim();
        const searchType = mapName.trim() ? 'name' : 'uid';

        if (query.length < 3) {
            toast.error('Please enter at least 3 characters to search');
            return;
        }

        setIsSearching(true);
        setHasSearched(true);
        try {
            const response = await apiClient.get('/api/v1/driver/maps/search', {
                params: {
                    query: query,
                    type: searchType,
                    page: page
                }
            });

            if (response.data.error) {
                toast.error(response.data.error);
                setSearchResults([]);
                setSearchPagination(null);
            } else {
                setSearchResults(response.data.results || []);
                setSearchPagination(response.data.pagination || null);
            }
        } catch (error: any) {
            console.error('Error searching maps:', error);
            toast.error(error.response?.data?.error || 'Failed to search maps');
            setSearchResults([]);
            setSearchPagination(null);
        } finally {
            setIsSearching(false);
        }
    };

    const handleMapSelect = (map: MapSearchResult) => {
        setSelectedMap(map);
        setShowMapDetails(true);
    };

    const handleAddNotification = async () => {
        if (!selectedMap) return;

        // Check if user has TM username set
        if (!tmUsernameStatus?.hasTmUsername) {
            setShowMapDetails(false);
            setShowTmUsernameModal(true);
            return;
        }

        setIsAddingNotification(true);
        try {
            const response = await apiClient.post('/api/v1/driver/notifications', {
                mapUid: selectedMap.mapUid,
                mapName: selectedMap.name
            });

            if (response.data.success) {
                setDialogMessage(`Notification added! Your current position on "${selectedMap.name}" is ${response.data.position} with time ${response.data.personalBestFormatted}`);
                setShowSuccessDialog(true);
                setShowMapDetails(false);
                setSelectedMap(null);
                setShowSearchModal(false);
                setMapName('');
                setMapUid('');
                setSearchResults([]);
                setSearchPagination(null);
                setHasSearched(false);
                fetchNotifications();
            }
        } catch (error: any) {
            console.error('Error adding notification:', error);
            if (error.response?.data?.requiresTmUsername) {
                setShowMapDetails(false);
                setShowTmUsernameModal(true);
            } else {
                const errorMsg = error.response?.data?.msg || 'Failed to add notification';
                setDialogMessage(errorMsg);
                setShowErrorDialog(true);
            }
        } finally {
            setIsAddingNotification(false);
        }
    };

    const handleDeleteNotification = async (notificationId: string) => {
        try {
            await apiClient.delete(`/api/v1/driver/notifications/${notificationId}`);
            toast.success('Notification deleted successfully!');
            fetchNotifications();
        } catch (error) {
            toast.error('Failed to delete notification');
        }
    };

    // Pagination functions
    const getTotalPages = () => {
        return Math.ceil(notifications.length / itemsPerPage);
    };

    const getCurrentPageNotifications = () => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        return notifications.slice(startIndex, endIndex);
    };

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const formatTime = (milliseconds: number): string => {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        const ms = milliseconds % 1000;
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    };

    const formatMedalTime = (time: number): string => {
        return formatTime(time);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="racing-card text-center">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading your notifications...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-primary to-secondary-bright rounded-xl shadow-glow">
                            <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-foreground">Driver Notifications</h1>
                            <p className="text-muted-foreground">Track when your records get beaten</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setActiveTab('notifications')}
                            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'notifications'
                                ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Settings className="w-4 h-4" />
                            Notifications
                        </button>
                        <button
                            onClick={() => setActiveTab('info')}
                            className={`px-4 py-2 rounded-xl font-medium transition-all duration-300 flex items-center gap-2 ${activeTab === 'info'
                                ? 'bg-gradient-to-r from-primary to-primary-glow text-white shadow-glow'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                        >
                            <Target className="w-4 h-4" />
                            Info
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                {activeTab === 'info' ? (
                    <div className="racing-card">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                                <Target className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-xl font-semibold">How Driver Notifications Work</h2>
                        </div>

                        <div className="space-y-4 text-muted-foreground">
                            <p>
                                Driver notifications update you when someone has beaten your time on a map.
                                Right now they are available for <strong className="text-foreground">top five positions only</strong>.
                            </p>

                            <p>
                                When you set up a notification you pick a map from Trackmania Exchange, the system
                                verifies that you have a top five position and adds it to the notification list.
                            </p>

                            <p>
                                Once per 24 hours a task runs to check whether someone has beaten your time on that
                                particular map. And if that has happened you will receive a notification in an email
                                with details.
                            </p>

                            <p className="text-sm bg-muted/50 p-4 rounded-xl">
                                <strong className="text-foreground">Note:</strong> All your notifications will be sent in a single email.
                            </p>
                        </div>
                    </div>
                ) : (
                    /* Notifications List */
                    <div className="space-y-4">
                        {notifications.length > 0 && (
                            <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-semibold">Your Active Notifications</h2>
                                    <span className="px-2 py-1 bg-primary/20 text-primary text-sm font-medium rounded-full border border-primary/30">
                                        {notifications.length} {notifications.length === 1 ? 'notification' : 'notifications'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        if (!tmUsernameStatus?.hasTmUsername) {
                                            setShowTmUsernameModal(true);
                                        } else {
                                            setShowSearchModal(true);
                                        }
                                    }}
                                    className="btn-racing-secondary flex items-center gap-2"
                                >
                                    <Plus size={20} />
                                    Add Notification
                                </button>
                            </div>
                        )}

                        {/* TM Username Status Display */}
                        {tmUsernameStatus && (
                            <div className="racing-card border-border/50 bg-muted/5 mb-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
                                        <User className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between mb-1">
                                            <h3 className="font-semibold text-foreground">Trackmania Username</h3>
                                            {tmUsernameStatus.hasTmUsername && (
                                                <button
                                                    onClick={() => {
                                                        setTmUsername(tmUsernameStatus.tmUsername || '');
                                                        setShowTmUsernameModal(true);
                                                    }}
                                                    className="text-xs text-primary hover:text-primary-glow transition-colors underline"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                        </div>
                                        {tmUsernameStatus.hasTmUsername ? (
                                            <div className="text-sm text-foreground">
                                                <p className="text-green-600 font-medium">✓ Connected as: <strong>{tmUsernameStatus.tmUsername}</strong></p>
                                                <p className="text-muted-foreground text-xs mt-1">You can create driver notifications</p>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-orange-600">
                                                <p className="font-medium">⚠️ No Trackmania username set</p>
                                                <p className="text-muted-foreground text-xs mt-1">Set your TM username to create driver notifications</p>
                                                <button
                                                    onClick={() => setShowTmUsernameModal(true)}
                                                    className="mt-2 text-xs text-primary hover:text-primary-glow transition-colors underline"
                                                >
                                                    Set TM Username
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        {notifications.length === 0 && !showSearchModal ? (
                            <div className="racing-card text-center py-12">
                                <Target className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-xl font-semibold mb-2">No notifications set</h3>
                                <p className="text-muted-foreground mb-6">
                                    Add your first driver notification to get alerted when your records are beaten
                                </p>
                                <button
                                    onClick={() => {
                                        if (!tmUsernameStatus?.hasTmUsername) {
                                            setShowTmUsernameModal(true);
                                        } else {
                                            setShowSearchModal(true);
                                        }
                                    }}
                                    className="btn-racing-secondary flex items-center gap-2 mx-auto"
                                >
                                    <Plus size={20} />
                                    Add Your First Notification
                                </button>
                            </div>
                        ) : notifications.length > 0 ? (
                            <>
                                {getCurrentPageNotifications().map((notification) => {
                                    const isInactive = notification.status === 'inactive';

                                    return (
                                        <div key={notification.id} className={`racing-card ${isInactive ? 'border-orange-500/50 bg-orange-50/10' : ''}`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4 flex-1">
                                                    <div className={`p-3 rounded-xl ${isInactive
                                                        ? 'bg-gradient-to-br from-orange-500 to-orange-600 shadow-orange-500/20'
                                                        : 'bg-gradient-to-br from-primary to-primary-glow shadow-glow'
                                                        }`}>
                                                        {isInactive ? (
                                                            <Target className="w-5 h-5 text-white" />
                                                        ) : (
                                                            <Trophy className="w-5 h-5 text-white" />
                                                        )}
                                                    </div>

                                                    <div className="flex-1">
                                                        <h3 className={`font-semibold mb-1 ${isInactive ? 'text-orange-600' : 'text-foreground'}`}>
                                                            {notification.mapName}
                                                        </h3>

                                                        <div className="flex items-center gap-6 text-sm text-muted-foreground mb-2">
                                                            <span>Map UID: {notification.mapUid}</span>
                                                            <span>Created: {new Date(notification.createdAt).toLocaleDateString()}</span>
                                                            {notification.lastChecked && (
                                                                <span>Last checked: {new Date(notification.lastChecked).toLocaleDateString()}</span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-4 text-sm">
                                                            {isInactive ? (
                                                                <span className="text-orange-600 font-medium">
                                                                    Status: <strong>Inactive - No longer in top 5</strong>
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col gap-1">
                                                                    <span className="text-foreground">
                                                                        Current Position: <strong>#{notification.currentPosition}</strong>
                                                                    </span>
                                                                    <span className="text-muted-foreground text-xs">
                                                                        Personal Best: <strong>{notification.personalBestFormatted}</strong>
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${isInactive
                                                        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
                                                        : 'bg-gradient-to-r from-primary to-primary-glow text-white'
                                                        }`}>
                                                        {isInactive ? 'Inactive' : `Position #${notification.currentPosition}`}
                                                    </div>

                                                    <button
                                                        onClick={() => handleDeleteNotification(notification.id)}
                                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all duration-300"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Pagination Controls */}
                                {notifications.length > itemsPerPage && (
                                    <div className="flex justify-center items-center gap-2 mt-6">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Previous
                                        </button>

                                        <div className="flex gap-1">
                                            {Array.from({ length: getTotalPages() }, (_, i) => i + 1).map((page) => (
                                                <button
                                                    key={page}
                                                    onClick={() => handlePageChange(page)}
                                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${page === currentPage
                                                            ? 'bg-primary text-white'
                                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === getTotalPages()}
                                            className="px-3 py-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}

                                {/* Pagination Info */}
                                {notifications.length > itemsPerPage && (
                                    <div className="text-center text-sm text-muted-foreground mt-2">
                                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, notifications.length)} of {notifications.length} notifications
                                    </div>
                                )}
                            </>
                        ) : null}
                    </div>
                )}

                {/* Search Modal */}
                {showSearchModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-4xl mx-4 w-full max-h-[90vh] overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-semibold flex items-center gap-2">
                                    <Search className="w-5 h-5" />
                                    Search Maps
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowSearchModal(false);
                                        setMapName('');
                                        setMapUid('');
                                        setSearchResults([]);
                                        setSearchPagination(null);
                                        setSelectedMap(null);
                                        setHasSearched(false);
                                    }}
                                    className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Search Form */}
                            <div className="space-y-4 mb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                        <input
                                            type="text"
                                            value={mapName}
                                            onChange={(e) => {
                                                setMapName(e.target.value);
                                                if (e.target.value.trim().length < 3) {
                                                    setHasSearched(false);
                                                }
                                            }}
                                            placeholder="Enter map name..."
                                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        />
                                    </div>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                        <input
                                            type="text"
                                            value={mapUid}
                                            onChange={(e) => {
                                                setMapUid(e.target.value);
                                                if (e.target.value.trim().length < 3) {
                                                    setHasSearched(false);
                                                }
                                            }}
                                            placeholder="Enter map UID..."
                                            className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <button
                                        onClick={() => handleSearch()}
                                        disabled={isSearching || (mapName.trim().length < 3 && mapUid.trim().length < 3)}
                                        className="btn-racing disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSearching ? 'Searching...' : 'Find Map'}
                                    </button>
                                </div>

                                <div className="text-center text-sm text-muted-foreground">
                                    Fill in either map name or map UID (minimum 3 characters)
                                </div>
                            </div>

                            {/* Search Results */}
                            {searchResults.length > 0 && (
                                <div className="space-y-4 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent hover:scrollbar-thumb-muted-foreground/50">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-foreground">Search Results</h3>
                                        <span className="text-sm text-muted-foreground">
                                            {searchResults.length} {searchResults.length === 1 ? 'result' : 'results'}
                                        </span>
                                    </div>
                                    {searchResults.map((map) => (
                                        <div
                                            key={map.mapUid}
                                            className="p-4 border border-border rounded-xl hover:bg-muted/50 transition-colors cursor-pointer"
                                            onClick={() => handleMapSelect(map)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-foreground mb-1 truncate">{map.name}</h4>
                                                    <div className="text-sm text-muted-foreground space-y-1">
                                                        <div>Map ID: {map.mapId} | UID: {map.mapUid}</div>
                                                        {map.medals && (
                                                            <div className="flex gap-4">
                                                                <span>Author: {formatMedalTime(map.medals.author)}</span>
                                                                <span>Gold: {formatMedalTime(map.medals.gold)}</span>
                                                                <span>Silver: {formatMedalTime(map.medals.silver)}</span>
                                                                <span>Bronze: {formatMedalTime(map.medals.bronze)}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 ml-4">
                                                    <div className="text-right">
                                                        <div className="text-sm font-medium text-foreground">
                                                            {map.authors.join(', ')}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            Authors
                                                        </div>
                                                    </div>
                                                    <div className="text-primary">
                                                        <ChevronRight className="w-5 h-5" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* No Results Found */}
                            {hasSearched && !isSearching && searchResults.length === 0 && (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 mx-auto mb-4 bg-muted/50 rounded-full flex items-center justify-center">
                                        <Search className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-foreground mb-2">No maps found</h3>
                                    <p className="text-muted-foreground mb-4">
                                        No maps match your search criteria. Try adjusting your search terms.
                                    </p>
                                    <div className="text-sm text-muted-foreground">
                                        <p>• Make sure you have at least 3 characters</p>
                                        <p>• Try searching by map name or map UID</p>
                                        <p>• Check for typos in your search</p>
                                    </div>
                                </div>
                            )}

                            {/* Pagination */}
                            {searchPagination && searchPagination.hasMore && (
                                <div className="flex justify-center mt-6">
                                    <button
                                        onClick={() => handleSearch(searchPagination.currentPage + 1)}
                                        disabled={isSearching}
                                        className="btn-racing disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Load More Results
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Map Details Modal */}
                {showMapDetails && selectedMap && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gradient-to-br from-primary to-primary-glow rounded-lg">
                                    <MapPin className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-semibold">Add Notification</h2>
                            </div>
                            <div className="space-y-4 mb-6">
                                <div>
                                    <h3 className="font-semibold text-foreground mb-2">{selectedMap.name}</h3>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        <div>Map ID: {selectedMap.mapId}</div>
                                        <div>UID: {selectedMap.mapUid}</div>
                                        <div>Authors: {selectedMap.authors.join(', ')}</div>
                                    </div>
                                </div>
                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h4 className="font-semibold mb-2">Before adding notification:</h4>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• We'll check if you're in top 5 on this map</li>
                                        <li>• You'll get notified if your position worsens</li>
                                        <li>• Notifications are checked daily at 6 AM CET</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowMapDetails(false)}
                                    className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddNotification}
                                    disabled={isAddingNotification}
                                    className="flex-1 btn-racing-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isAddingNotification ? 'Adding...' : 'Add Notification'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Success Dialog */}
                {showSuccessDialog && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Trophy className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-green-600">Success!</h3>
                                <p className="text-muted-foreground mb-6">{dialogMessage}</p>
                                <button
                                    onClick={() => setShowSuccessDialog(false)}
                                    className="btn-racing"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Error Dialog */}
                {showErrorDialog && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="text-center">
                                <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <X className="w-8 h-8 text-white" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-red-600">Error</h3>
                                <p className="text-muted-foreground mb-6">{dialogMessage}</p>
                                <button
                                    onClick={() => setShowErrorDialog(false)}
                                    className="btn-racing"
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* TM Username Modal */}
                {showTmUsernameModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="racing-card max-w-md mx-4">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                                    <User className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-semibold">
                                    {tmUsernameStatus?.hasTmUsername ? 'Edit Trackmania Username' : 'Set Trackmania Username'}
                                </h2>
                            </div>

                            <div className="space-y-4 mb-6">
                                <p className="text-muted-foreground">
                                    {tmUsernameStatus?.hasTmUsername
                                        ? 'Update your Trackmania username. This will be used to check your position on leaderboards.'
                                        : 'To create driver notifications, you need to set your Trackmania username. This will be used to check your position on leaderboards.'
                                    }
                                </p>

                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                                    <input
                                        type="text"
                                        value={tmUsername}
                                        onChange={(e) => setTmUsername(e.target.value)}
                                        placeholder={tmUsernameStatus?.hasTmUsername ? `Current: ${tmUsernameStatus.tmUsername}` : "Enter your Trackmania username..."}
                                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-input border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                                    />
                                </div>

                                <div className="bg-muted/50 p-4 rounded-xl">
                                    <h4 className="font-semibold mb-2">Important:</h4>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• This should be your Trackmania username (not Trackmania Exchange)</li>
                                        <li>• We'll verify the username exists before saving</li>
                                        <li>• You can only create notifications for maps where you're in top 5</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowTmUsernameModal(false);
                                        setTmUsername('');
                                    }}
                                    className="flex-1 px-4 py-2 rounded-xl border border-border hover:bg-muted/50 transition-colors duration-300"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleVerifyTmUsername}
                                    disabled={isVerifyingTmUsername || !tmUsername.trim()}
                                    className="flex-1 btn-racing-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isVerifyingTmUsername ? 'Verifying...' : (tmUsernameStatus?.hasTmUsername ? 'Update Username' : 'Verify & Save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DriverPage;