import { useState } from 'react';
import { AudioProvider } from './context/AudioContext';
import { Header } from './components/Header/Header';
import { MainTts } from './components/MainTts/MainTts';
import { VoiceManagement } from './components/VoiceManagement/VoiceManagement';
import { SavedAudioSection } from './components/SavedAudioSection/SavedAudioSection';
import { TtsGuideModal } from './components/TtsGuideModal/TtsGuideModal';
import { AudioSaveModal } from './components/AudioSaveModal/AudioSaveModal';

function App() {
  const [activeTab, setActiveTab] = useState('generate');

  const tabStyles = "flex-1 px-6 py-5 text-sm font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 text-center";
  const activeTabStyles = "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg transform scale-105";
  const inactiveTabStyles = "text-gray-400 hover:bg-gray-800 hover:text-white";

  return (
    <AudioProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div
          className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%239C92AC\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50"
        ></div>

        <div className="relative z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
            <div className="space-y-8">
              <Header />

              <div className="w-full">
                <div className="flex p-1.5 bg-gray-800/60 rounded-xl backdrop-blur-sm border border-gray-700 shadow-xl max-w-8xl mx-auto">
                  <button 
                    onClick={() => setActiveTab('generate')}
                    className={`${tabStyles} ${activeTab === 'generate' ? activeTabStyles : inactiveTabStyles}`}
                  >
                    🎙️ Generate Audio
                  </button>
                  <button 
                    onClick={() => setActiveTab('voices')}
                    className={`${tabStyles} ${activeTab === 'voices' ? activeTabStyles : inactiveTabStyles}`}
                  >
                    🎭 My Voices
                  </button>
                  <button 
                    onClick={() => setActiveTab('saved')}
                    className={`${tabStyles} ${activeTab === 'saved' ? activeTabStyles : inactiveTabStyles}`}
                  >
                    💾 Saved Audio
                  </button>
                </div>
              </div>

              <div className="animate-fadeIn">
                {activeTab === 'generate' && (
                  <MainTts />
                )}

                {activeTab === 'voices' && (
                  <VoiceManagement />
                )}

                {activeTab === 'saved' && (
                  <SavedAudioSection />
                )}
              </div>

              <TtsGuideModal />
              <AudioSaveModal />
            </div>
          </div>
        </div>
      </div>
    </AudioProvider>
  );
}

export default App;