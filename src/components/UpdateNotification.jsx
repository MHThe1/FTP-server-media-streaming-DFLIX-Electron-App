import React, { useState, useEffect } from 'react';

const UpdateNotification = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [versionInfo, setVersionInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Check if running in Electron
    if (!window.require) return;

    const { ipcRenderer } = window.require('electron');

    const onUpdateAvailable = (event, info) => {
      setUpdateAvailable(true);
      setVersionInfo(info);
    };

    const onDownloadProgress = (event, progressObj) => {
      setIsDownloading(true);
      setDownloadProgress(progressObj.percent);
    };

    const onUpdateDownloaded = (event, info) => {
      setIsDownloading(false);
      setUpdateDownloaded(true);
      setVersionInfo(info);
    };

    const onUpdateError = (event, err) => {
      setIsDownloading(false);
      setError(err);
      // Auto-dismiss error after 5 seconds to not annoy user
      setTimeout(() => setError(null), 5000);
    };

    ipcRenderer.on('update-available', onUpdateAvailable);
    ipcRenderer.on('update-download-progress', onDownloadProgress);
    ipcRenderer.on('update-downloaded', onUpdateDownloaded);
    ipcRenderer.on('update-error', onUpdateError);

    // Initial check (optional, main process does it on start)
    // ipcRenderer.invoke('check-for-updates');

    return () => {
      ipcRenderer.removeListener('update-available', onUpdateAvailable);
      ipcRenderer.removeListener('update-download-progress', onDownloadProgress);
      ipcRenderer.removeListener('update-downloaded', onUpdateDownloaded);
      ipcRenderer.removeListener('update-error', onUpdateError);
    };
  }, []);

  const handleDownload = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('download-update');
    setIsDownloading(true);
  };

  const handleRestart = () => {
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('quit-and-install');
  };

  const handleDismiss = () => {
    setUpdateAvailable(false);
  };

  if (!updateAvailable && !updateDownloaded && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm w-full bg-[#1a2332] border border-white/10 rounded-lg shadow-2xl p-4 animate-fade-in-up">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-[#00A8E1]/20 flex items-center justify-center text-[#00A8E1]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium mb-1">
            {error ? 'Update Error' : updateDownloaded ? 'Update Ready' : 'Update Available'}
          </h3>
          
          <p className="text-gray-400 text-sm mb-3">
            {error ? 'Failed to download update.' : 
             updateDownloaded ? `Version ${versionInfo?.version} is ready to install.` :
             isDownloading ? `Downloading... ${Math.round(downloadProgress)}%` :
             `A new version ${versionInfo?.version} is available.`}
          </p>

          {isDownloading && (
            <div className="w-full bg-white/10 rounded-full h-1.5 mb-3 overflow-hidden">
              <div 
                className="bg-[#00A8E1] h-full rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          )}

          <div className="flex gap-3">
            {!updateDownloaded && !isDownloading && !error && (
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-[#00A8E1] hover:bg-[#0096C8] text-white text-sm font-medium rounded transition-colors"
              >
                Download
              </button>
            )}
            
            {updateDownloaded && (
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-[#00A8E1] hover:bg-[#0096C8] text-white text-sm font-medium rounded transition-colors"
              >
                Restart Now
              </button>
            )}

            {!isDownloading && (
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
