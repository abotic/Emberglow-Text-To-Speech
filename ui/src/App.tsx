import React, { useState } from 'react';
import { AudioProvider } from './context/AudioContext';
import { Header } from './components/Header/Header';
import { VoiceCloneSection } from './components/VoiceCloneSection/VoiceCloneSection';
import { TextGenerationSection } from './components/TextGenerationSection/TextGenerationSection';
import { AudioPlayer } from './components/AudioPlayer/AudioPlayer';
import { SafeTtsSection } from './components/SafeTtsSection/SafeTts';

function App() {
  const [activeTab, setActiveTab] = useState('generate');

  const tabStyles = "px-4 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none";
  const activeTabStyles = "bg-blue-600 text-white";
  const inactiveTabStyles = "text-gray-400 hover:bg-gray-800 hover:text-white";

  return (
    <AudioProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div
          className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%239C92AC\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"
        ></div>

        <div className="relative z-10 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto space-y-8">
            <Header />

            <div className="flex justify-center p-1 bg-gray-800/50 rounded-lg backdrop-blur-sm border border-gray-700">
                <button 
                    onClick={() => setActiveTab('generate')}
                    className={`${tabStyles} ${activeTab === 'generate' ? activeTabStyles : inactiveTabStyles}`}
                >
                    Standard Generation
                </button>
                <button 
                    onClick={() => setActiveTab('safe')}
                    className={`${tabStyles} ${activeTab === 'safe' ? activeTabStyles : inactiveTabStyles}`}
                >
                    Safe Long-Form (Projects)
                </button>
            </div>

            {activeTab === 'generate' && (
                <>
                    <VoiceCloneSection />
                    <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-800"></div></div><div className="relative flex justify-center text-sm"><span className="px-4 bg-gray-900 text-gray-500">AND</span></div></div>
                    <TextGenerationSection />
                    <AudioPlayer />
                </>
            )}

            {activeTab === 'safe' && (
                <SafeTtsSection />
            )}

          </div>
        </div>
      </div>
    </AudioProvider>
  );
}

export default App;
