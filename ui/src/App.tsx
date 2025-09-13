import React from 'react';
import { AudioProvider } from './context/AudioContext';
import { Header } from './components/Header/Header';
import { VoiceCloneSection } from './components/VoiceCloneSection/VoiceCloneSection';
import { TextGenerationSection } from './components/TextGenerationSection/TextGenerationSection';
import { AudioPlayer } from './components/AudioPlayer/AudioPlayer';

function App() {
  return (
    <AudioProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black">
        <div
          className="absolute inset-0 
          bg-[url('data:image/svg+xml,%3Csvg width=\\'60\\' height=\\'60\\' viewBox=\\'0 0 60 60\\' xmlns=\\'http://www.w3.org/2000/svg\\'%3E%3Cg fill=\\'none\\' fill-rule=\\'evenodd\\'%3E%3Cg fill=\\'%239C92AC\\' fill-opacity=\\'0.03\\'%3E%3Cpath d=\\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] 
          opacity-50"
        ></div>

        <div className="relative z-10 container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto space-y-8">
            <Header />

            {/* Voice Cloning Section */}
            <VoiceCloneSection />

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-gray-900 text-gray-500">OR</span>
              </div>
            </div>

            {/* Text Generation Section */}
            <TextGenerationSection />

            {/* Audio Player */}
            <AudioPlayer />
          </div>
        </div>
      </div>
    </AudioProvider>
  );
}

export default App;
