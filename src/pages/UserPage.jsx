import React, { useState } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useUserLists } from '../hooks/useUserLists';
import ContentRow from '../components/ContentRow';
import MediaModal from '../components/MediaModal';
import { userContent } from '../services/userContent';

const UserPage = ({ onBack, onPlay }) => {
    const { library, hydrateItems, loading } = useLibrary();
    const userLists = useUserLists();
    const [selectedItem, setSelectedItem] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    const handleDeleteAllData = () => {
        userContent.clearAllData();
        setIsDeleteModalOpen(false);
    };

    const continueWatching = hydrateItems(userLists.continueWatching);
    const favorites = hydrateItems(userLists.favorites);
    const watchLater = hydrateItems(userLists.watchLater);

    return (
        <div className="min-h-screen bg-[#141414] text-white overflow-x-hidden">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-[#141414]/90 backdrop-blur-md border-b border-white/10 px-4 py-4 md:px-12 flex items-center gap-4">
                <button 
                    onClick={onBack}
                    className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                </button>
                <div className="flex items-center gap-4">
                     <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center text-white shadow-lg border border-white/10">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                     </div>
                     <h1 className="text-2xl font-bold">My Library</h1>
                </div>
            </div>

            <div className="px-4 md:px-12 py-8 space-y-12">
                {/* Stats / Info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">In Progress</span>
                        <div className="text-4xl font-bold mt-2 text-blue-500">{continueWatching.length}</div>
                    </div>
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Favorites</span>
                        <div className="text-4xl font-bold mt-2 text-red-500">{favorites.length}</div>
                    </div>
                    <div className="bg-[#1a1a1a] p-6 rounded-lg border border-white/5">
                        <span className="text-gray-400 text-sm font-medium uppercase tracking-wider">Watch Later</span>
                        <div className="text-4xl font-bold mt-2 text-yellow-500">{watchLater.length}</div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                         <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {continueWatching.length > 0 && (
                            <ContentRow 
                                title="Continue Watching" 
                                items={continueWatching}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => {
                                    const pathToRemove = item.filePath || item.path;
                                    userContent.removeContinueWatching(pathToRemove);
                                }}
                            />
                        )}

                        {favorites.length > 0 && (
                            <ContentRow 
                                title="Favorites" 
                                items={favorites}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => userContent.removeFromFavorites(item.path)}
                            />
                        )}

                        {watchLater.length > 0 && (
                            <ContentRow 
                                title="Watch Later" 
                                items={watchLater}
                                onCardClick={setSelectedItem}
                                onRemove={(item) => userContent.removeFromWatchLater(item.path)}
                            />
                        )}

                        {continueWatching.length === 0 && favorites.length === 0 && watchLater.length === 0 && (
                             <div className="text-center py-20 text-gray-500">
                                 <p className="text-xl">Your list is empty.</p>
                                 <p className="text-sm mt-2">Start watching movies or add them to your favorites!</p>
                             </div>
                        )}
                    </>
                )}
            </div>

            <div className="px-4 md:px-12 pb-12">
                <div className="pt-8 border-t border-white/10">
                    <h2 className="text-xl font-bold mb-4 text-red-500">Danger Zone</h2>
                    <p className="text-gray-400 mb-6 max-w-2xl">
                        Want to start fresh? This will permanently delete your Continue Watching history, Favorites, and Watch Later list. This action cannot be undone.
                    </p>
                    <button
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="px-6 py-3 bg-red-600/20 hover:bg-red-600 text-red-100 hover:text-white border border-red-600/50 hover:border-red-500 font-bold rounded-lg transition-all duration-200 flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Delete All Data
                    </button>
                </div>
            </div>

            {/* Modal */}
            {selectedItem && (
                <MediaModal 
                    item={selectedItem} 
                    onClose={() => setSelectedItem(null)} 
                    onPlay={(item) => {
                        setSelectedItem(null);
                        onPlay(item);
                    }} 
                />
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                    <div className="bg-[#1a1a1a] p-8 rounded-2xl max-w-md w-full border border-white/10 shadow-2xl relative overflow-hidden">
                        {/* Background warning pattern */}
                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                            <svg className="w-32 h-32 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </div>
                        
                        <h3 className="text-2xl font-bold mb-4 text-white">Delete All Data?</h3>
                        <div className="text-gray-400 mb-8 leading-relaxed">
                            <p className="mb-4">This action will permanently delete all your local data including:</p>
                            <ul className="space-y-2 mb-4">
                                <li className="flex items-center gap-2 text-red-400/80">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Continue Watching history
                                </li>
                                <li className="flex items-center gap-2 text-red-400/80">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Favorites list
                                </li>
                                <li className="flex items-center gap-2 text-red-400/80">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Watch Later list
                                </li>
                            </ul>
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                                <strong>Warning:</strong> This action cannot be undone.
                            </div>
                        </div>
                        
                        <div className="flex gap-4">
                            <button
                                onClick={() => setIsDeleteModalOpen(false)}
                                className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl transition-colors border border-white/5"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteAllData}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-900/20"
                            >
                                Yes, Delete All
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserPage;
