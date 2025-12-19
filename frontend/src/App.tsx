import { useState } from 'react';

function App() {
  // Pamięć aplikacji
  const [masterPassword, setMasterPassword] = useState('');
  const [secretNote, setSecretNote] = useState('');
  const [encryptedData, setEncryptedData] = useState<string | null>(null);
  const [decryptedView, setDecryptedView] = useState<string>('');
  const [logs, setLogs] = useState<string[]>(['> Inicjalizacja...', '> Czekam na wprowadzenie danych do zaszyfrowania...']);

  //Dodawanie wpisów w konsoli
  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`].slice(-5));

  //Komunikacja z GO

  const saveToServer = async (encryptedBlob: string) => {
    try {
      addLog("SIEĆ: Wysyłanie do serwera...");
      const response = await fetch('http://localhost:8080/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: encryptedBlob })
      });

      if (response.ok) {
        addLog("SERWER: Zapisano dane w bazie!");
      } else {
        addLog("SERWER ERROR: Błąd zapisu.");
      }
    } catch (e) {
      addLog("BŁĄD SIECI: Czy serwer Go działa?");
    }
  };

  const loadFromServer = async () => {
    try {
      addLog("SIEĆ: Pobieranie danych...");
      const response = await fetch('http://localhost:8080/api/load');
      
      if (response.ok) {
        const data = await response.json();
        setEncryptedData(data.content);
        addLog("SERWER: Dane pobrane.");
        addLog(`BLOB: ${data.content.substring(0, 15)}...`);
      } else {
        addLog("SERWER: Baza jest pusta.");
      }
    } catch (e) {
      addLog("BŁĄD SIECI: Brak połączenia.");
    }
  };

  // Zamiana hasła na klucz z użyciem PBKDF2
  const getKey = async () => {
    const enc = new TextEncoder();
    
    // Import hasła
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", 
      enc.encode(masterPassword), 
      { name: "PBKDF2" }, 
      false, 
      ["deriveKey"]
    );
    
    // Użycie soli kryptograficznej
    const salt = enc.encode("sol-bunkra-demo"); 

    // Wygenerowanie właściwego klucza AES
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  };

  // Szyfrowanie (AES-GCM)
  const handleEncrypt = async () => {
    if (!masterPassword || !secretNote) {
      addLog("ERROR: Błędne hasło!");
      return;
    }

    try {
      const key = await getKey();
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(secretNote);

      // Właściwe szyfrowanie
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
      );

      const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
      const encryptedHex = Array.from(new Uint8Array(encryptedContent)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const fullBlob = `${ivHex}:${encryptedHex}`;
      
      setEncryptedData(fullBlob);
      setDecryptedView('');
      addLog("Sukces! Dane zaszyfrowane.");
      
      //Automatyczna wysyłka do serwera po zaszyfrowaniu
      await saveToServer(fullBlob);

    } catch (e) {
      addLog("ERROR! Dane niezaszyfrowane.");
      console.error(e);
    }
  };

  //Odszyfrowywanie
  const handleDecrypt = async () => {
    if (!masterPassword || !encryptedData) return;

    try {
      const key = await getKey();
      const [ivHex, encryptedHex] = encryptedData.split(':');

      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedBytes
      );

      setDecryptedView(new TextDecoder().decode(decryptedContent));
      addLog("Przyznanie dostępu!");
    } catch (e) {
      addLog("Odmowa dostępu!");
      setDecryptedView('Błąd odszyfrowywania!');
    }
  };

  return (
    <div className="min-h-screen bg-bunker-dark text-bunker-text font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border-2 border-gray-700 bg-bunker-panel shadow-2xl relative">
        
        {/* Główny panel */}
        <div className="flex justify-between items-center bg-gray-800 p-2 border-b-2 border-gray-700">
          {/* Twoja nazwa systemu */}
          <span className="text-xs text-gray-400">AHNS Password Manager</span>
          
          <div className="flex gap-2">
            <div className={`w-3 h-3 rounded-full transition-all ${masterPassword ? 'bg-green-500 shadow-[0_0_8px_rgba(0,255,0,0.8)]' : 'bg-red-500'}`}></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          </div>
        </div>

        <div className="p-8 space-y-6">
          <h1 className="text-3xl font-bold text-neon-blue tracking-wider text-center uppercase border-b border-gray-700 pb-4">
            Menedżer Haseł
          </h1>

          {/* Wejścia */}
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest">1. Hasło Główne (Klucz)</label>
              <input 
                type="password" 
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 p-3 text-neon-blue focus:border-neon-blue focus:outline-none transition-colors"
                placeholder="Wpisz klucz szyfrujący..."
              />
            </div>
            
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest">2. Tajne dane</label>
              <textarea 
                rows={3}
                value={secretNote}
                onChange={(e) => setSecretNote(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 p-3 text-white focus:border-neon-blue focus:outline-none transition-colors"
                placeholder="***"
              />
            </div>
          </div>

          {/* Przyciski - Zmieniono na 3 kolumny */}
          <div className="grid grid-cols-3 gap-4">
            <button onClick={handleEncrypt} className="bg-gray-800 border border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-white p-3 font-bold transition-all uppercase text-xs">
              ZASZYFRUJ
            </button>
            <button onClick={loadFromServer} className="bg-gray-800 border border-gray-600 text-yellow-500 hover:border-yellow-500 hover:text-white p-3 font-bold transition-all uppercase text-xs">
              POBIERZ
            </button>
            <button onClick={handleDecrypt} disabled={!encryptedData} className="bg-gray-800 border border-gray-600 text-green-500 hover:border-green-500 hover:bg-green-900 disabled:opacity-30 p-3 font-bold transition-all uppercase text-xs">
              ODSZYFRUJ
            </button>
          </div>
          
          {/* Baza danych */}
          {encryptedData && (
            <div className="bg-black border border-gray-800 p-4 relative overflow-hidden group">
              <span className="absolute top-0 right-0 bg-gray-800 text-[10px] px-2 py-1 text-gray-400">Baza danych (AES-256)</span>
              <p className="text-xs text-gray-500 break-all font-mono opacity-70 group-hover:opacity-100 transition-opacity">
                {encryptedData}
              </p>
            </div>
          )}

          {/* Wynik odszyfrowania */}
          {decryptedView && (
             <div className={`p-4 border ${decryptedView.includes('!') ? 'border-red-500 bg-red-900/20' : 'border-green-500/30 bg-green-900/20'}`}>
                <label className="text-[10px] uppercase opacity-70">Wynik operacji:</label>
                <p className={decryptedView.includes('!') ? 'text-red-500 font-bold' : 'text-green-400 font-bold'}>{decryptedView}</p>
             </div>
          )}

          {/* Logi */}
          <div className="mt-4 p-4 bg-black border border-gray-800 font-mono text-xs text-gray-500 h-32 overflow-hidden flex flex-col justify-end">
            {logs.map((log, i) => (
              <p key={i} className={log.includes("ERROR") || log.includes("Odmowa") || log.includes("BŁĄD") ? "text-red-500" : log.includes("Sukces") || log.includes("Przyznanie") || log.includes("SERWER") ? "text-green-500" : ""}>
                {log}
              </p>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;