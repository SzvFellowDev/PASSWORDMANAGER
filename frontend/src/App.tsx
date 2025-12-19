import { useState, useEffect } from 'react';

interface VaultItem {
  id: string;
  content: string;
  created_at: string;
}

function App() {
  // Pamięć aplikacji
  const [masterPassword, setMasterPassword] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [inputSecret, setInputSecret] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [decryptedView, setDecryptedView] = useState<string>('');
  const [logs, setLogs] = useState<string[]>(['> Inicjalizacja...', '> Gotowy do pracy...']);

  //Dodawanie wpisów w konsoli
  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`].slice(-5));

  //Komunikacja z GO
  const refreshVault = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/all');
      if (response.ok) {
        const data = await response.json();
        setVaultItems(data.items || []);
        addLog(`SYNC: Pobrano ${data.items ? data.items.length : 0} wpisów.`);
      }
    } catch (e) {
      addLog("BŁĄD SIECI: Nie można pobrać listy.");
    }
  };

  useEffect(() => {
    refreshVault();
  }, []);

  const addToServer = async (encryptedBlob: string) => {
    try {
      addLog("SIEĆ: Wysyłanie do serwera...");
      await fetch('http://localhost:8080/api/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: encryptedBlob })
      });
      addLog("SERWER: Zapisano dane w bazie!");
      refreshVault();
      setInputTitle('');
      setInputSecret('');
    } catch (e) {
      addLog("SERWER ERROR: Błąd zapisu.");
    }
  };

  //Zamiana hasła na klucz z użyciem PBKDF2
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
    
    //Użycie soli kryptograficznej
    const salt = enc.encode("sol-bunkra-demo"); 

    //Wygenerowanie właściwego klucza AES
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  };

  // Szyfrowanie (AES-GCM)
  const handleEncryptAndSave = async () => {
    if (!masterPassword || !inputTitle || !inputSecret) {
      addLog("ERROR: Wypełnij wszystkie pola!");
      return;
    }

    try {
      const key = await getKey();
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      const dataPackage = JSON.stringify({
        title: inputTitle,
        secret: inputSecret
      });
      
      const encodedData = new TextEncoder().encode(dataPackage);

      //Właściwe szyfrowanie
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedData
      );

      const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
      const encryptedHex = Array.from(new Uint8Array(encryptedContent)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const fullBlob = `${ivHex}:${encryptedHex}`;
      
      addLog("Sukces! Dane zaszyfrowane.");

      //Automatyczna wysyłka do serwera po zaszyfrowaniu
      await addToServer(fullBlob);

    } catch (e) {
      addLog("ERROR! Dane niezaszyfrowane.");
      console.error(e);
    }
  };

  //Odszyfrowywanie
  const handleDecryptItem = async (blob: string) => {
    if (!masterPassword) {
      addLog("ERROR: Podaj hasło główne!");
      return;
    }

    try {
      const key = await getKey();
      const [ivHex, encryptedHex] = blob.split(':');
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encryptedBytes
      );

      const decryptedString = new TextDecoder().decode(decryptedContent);
      const data = JSON.parse(decryptedString);

      setDecryptedView(`TYTUŁ: ${data.title}\nDANE: ${data.secret}`);
      addLog("Przyznanie dostępu!");
    } catch (e) {
      addLog("Odmowa dostępu!");
      setDecryptedView('Błąd odszyfrowywania!');
    }
  };

  return (
    <div className="min-h-screen bg-bunker-dark text-bunker-text font-mono p-8 flex flex-col items-center">
      
      <div className="w-full max-w-4xl flex justify-between items-center border-b-2 border-gray-700 pb-4 mb-8">
        {/* Główny panel */}
        <div>
          <h1 className="text-2xl font-bold text-neon-blue tracking-wider uppercase">AHNS Password Manager</h1>
        </div>
        <div className="flex gap-2">
            <div className={`w-3 h-3 rounded-full transition-all ${masterPassword ? 'bg-green-500 shadow-[0_0_8px_rgba(0,255,0,0.8)]' : 'bg-red-500'}`}></div>
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        
        <div className="border-2 border-gray-700 bg-bunker-panel p-6 shadow-2xl h-fit">
          <h2 className="text-xl border-b border-gray-700 pb-2 mb-4 text-gray-300 uppercase">Dodaj wpis</h2>
          
          {/* Wejścia */}
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-neon-blue font-bold tracking-widest">Klucz Główny</label>
              <input 
                type="password" 
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full bg-black border border-neon-blue p-3 text-white focus:outline-none focus:shadow-[0_0_10px_rgba(41,98,255,0.3)] transition-all"
                placeholder="Wpisz klucz..."
              />
            </div>

            <hr className="border-gray-700"/>

            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest">Serwis Internetowy</label>
              <input 
                type="text" 
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 p-2 text-white focus:border-neon-blue focus:outline-none"
                placeholder="np. Facebook"
              />
            </div>
            
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest">Tajne dane</label>
              <textarea 
                rows={2}
                value={inputSecret}
                onChange={(e) => setInputSecret(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 p-2 text-white focus:border-neon-blue focus:outline-none"
                placeholder="Login / Hasło..."
              />
            </div>

            {/* Przyciski*/}
            <button onClick={handleEncryptAndSave} className="w-full bg-neon-blue text-white font-bold p-3 hover:bg-blue-600 transition-all uppercase text-sm shadow-lg">
              SZYFRUJ I DODAJ
            </button>
          </div>

           {/* Logi */}
           <div className="mt-6 p-2 bg-black border border-gray-800 font-mono text-[10px] text-gray-500 h-24 overflow-hidden flex flex-col justify-end">
            {logs.map((log, i) => (
              <p key={i} className={log.includes("ERROR") || log.includes("BŁĄD") || log.includes("Odmowa") ? "text-red-500" : log.includes("SERWER") || log.includes("Sukces") || log.includes("Przyznanie") ? "text-green-500" : ""}>
                {log}
              </p>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          
          {/* Wynik odszyfrowania */}
          <div className={`border-2 p-6 transition-all min-h-[150px] flex flex-col justify-center ${decryptedView.includes('!') ? 'border-red-500 bg-red-900/10' : decryptedView ? 'border-green-500 bg-green-900/10' : 'border-gray-700 bg-bunker-panel'}`}>
             {!decryptedView && <p className="text-gray-600 text-center text-sm"> Wybierz wpis z listy, aby odszyfrować </p>}
             {decryptedView && (
               <div className="whitespace-pre-wrap font-bold text-lg text-center animate-pulse">
                 {decryptedView}
               </div>
             )}
          </div>

          {/* Baza danych */}
          <div className="border-2 border-gray-700 bg-bunker-panel p-4 shadow-2xl flex-1 overflow-auto max-h-[400px]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm uppercase text-gray-400">Lista Wpisów ({vaultItems.length})</h2>
              <button onClick={refreshVault} className="text-[10px] text-neon-blue hover:text-white border border-neon-blue px-2 py-1">ODŚWIEŻ</button>
            </div>

            <div className="space-y-2">
              {vaultItems.length === 0 && <p className="text-gray-600 text-center py-4">Baza jest pusta.</p>}
              
              {vaultItems.map((item) => (
                <div key={item.id} className="bg-gray-900 border border-gray-700 p-3 flex justify-between items-center hover:border-gray-500 transition-colors group">
                  <div className="overflow-hidden">
                    <p className="text-xs text-neon-blue font-bold">ID: {item.id}</p>
                    <p className="text-[10px] text-gray-500 truncate w-32">{item.created_at}</p>
                  </div>
                  <div className="text-right">
                     <button 
                        onClick={() => handleDecryptItem(item.content)}
                        className="bg-gray-800 text-gray-300 text-xs px-3 py-1 border border-gray-600 hover:bg-green-600 hover:text-white hover:border-green-500 transition-all uppercase"
                     >
                       ODSZYFRUJ
                     </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;