import { useState, useEffect } from 'react';

interface VaultItem {
  id: string;
  content: string;
  created_at: string;
  decryptedTitle?: string; 
}

function App() {
  //Pamięć aplikacji
  const [masterPassword, setMasterPassword] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [inputSecret, setInputSecret] = useState('');
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [decryptedView, setDecryptedView] = useState<string>('');
  const [logs, setLogs] = useState<string[]>(['> Inicjalizacja...', '> Gotowy do pracy...']);

  //Dodawanie wpisów w konsoli
  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`].slice(-5));

  //Sprawdzenie czy chociaż jeden element został odszyfrowany (czy hasło jest poprawne)
  const isVaultUnlocked = vaultItems.some(item => item.decryptedTitle);

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
  const getKey = async (passwordOverride?: string) => {
    const passwordToUse = passwordOverride || masterPassword;
    const enc = new TextEncoder();
    
    //Import hasła
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", 
      enc.encode(passwordToUse), 
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

  const tryDecryptTitle = async (blob: string, key: CryptoKey): Promise<string | null> => {
    try {
      const [ivHex, encryptedHex] = blob.split(':');
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

      const decryptedContent = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv }, key, encryptedBytes
      );

      const decryptedString = new TextDecoder().decode(decryptedContent);
      const data = JSON.parse(decryptedString);
      return data.title;
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    const decryptList = async () => {
      if (!masterPassword || vaultItems.length === 0) return;

      try {
        const key = await getKey(masterPassword);
        
        const updatedItems = await Promise.all(vaultItems.map(async (item) => {
          if (item.decryptedTitle) return item;
          const title = await tryDecryptTitle(item.content, key);
          return title ? { ...item, decryptedTitle: title } : item;
        }));

        setVaultItems(prev => {
           const needsUpdate = updatedItems.some((item, idx) => item.decryptedTitle !== prev[idx]?.decryptedTitle);
           return needsUpdate ? updatedItems : prev;
        });
      } catch (e) { }
    };

    const timeoutId = setTimeout(decryptList, 500);
    return () => clearTimeout(timeoutId);
  }, [masterPassword, vaultItems]);

  //Szyfrowanie (AES-GCM)
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
    <div className="min-h-screen bg-bunker-dark text-bunker-text font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border-2 border-gray-700 bg-bunker-panel shadow-2xl relative flex flex-col max-h-[90vh]">
        
        {/* Główny panel */}
        <div className="flex justify-between items-center bg-gray-800 p-2 border-b-2 border-gray-700 shrink-0">
          {/* Twoja nazwa systemu */}
          <span className="text-xs text-gray-400">AHNS Password Manager</span>
          
          <div className="flex gap-2">
            <div className={`w-3 h-3 rounded-full transition-all ${isVaultUnlocked ? 'bg-green-500 shadow-[0_0_8px_rgba(0,255,0,0.8)]' : 'bg-red-500'}`}></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          </div>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          <h1 className="text-3xl font-bold text-neon-blue tracking-wider text-center uppercase border-b border-gray-700 pb-4">
            Menedżer Haseł
          </h1>

          {/* Wejścia */}
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase text-gray-500 tracking-widest">Klucz dostępu: </label>
              <input 
                type="password" 
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="w-full bg-gray-900 border border-gray-600 p-3 text-neon-blue focus:border-neon-blue focus:outline-none transition-colors"
                placeholder="********"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-xs uppercase text-gray-500 tracking-widest">Serwis</label>
                <input 
                    type="text" 
                    value={inputTitle}
                    onChange={(e) => setInputTitle(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 p-3 text-white focus:border-neon-blue focus:outline-none"
                    placeholder=""
                />
               </div>
               <div>
                <label className="text-xs uppercase text-gray-500 tracking-widest">Dane</label>
                <input 
                    type="text" 
                    value={inputSecret}
                    onChange={(e) => setInputSecret(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-600 p-3 text-white focus:border-neon-blue focus:outline-none"
                    placeholder=""
                />
               </div>
            </div>
          </div>

          {/* Przyciski */}
          <div className="grid grid-cols-2 gap-4">
            <button onClick={handleEncryptAndSave} className="bg-gray-800 border border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-white p-3 font-bold transition-all uppercase text-xs">
              SZYFRUJ
            </button>
            <button onClick={refreshVault} className="bg-gray-800 border border-gray-600 text-yellow-500 hover:border-yellow-500 hover:text-white p-3 font-bold transition-all uppercase text-xs">
              ODŚWIEŻ LISTĘ
            </button>
          </div>
          
          {/* Wynik odszyfrowania */}
          {decryptedView && (
             <div className={`p-4 border ${decryptedView.includes('!') ? 'border-red-500 bg-red-900/20' : 'border-green-500/30 bg-green-900/20'}`}>
                <label className="text-[10px] uppercase opacity-70">Twoje dane: </label>
                <p className={`whitespace-pre-wrap ${decryptedView.includes('!') ? 'text-red-500 font-bold' : 'text-green-400 font-bold'}`}>{decryptedView}</p>
             </div>
          )}

          {/* Baza danych */}
          <div className="border border-gray-700 bg-black/50 p-2">
            <h3 className="text-xs text-gray-500 mb-2 uppercase border-b border-gray-800 pb-1 flex justify-between">
                <span>Zawartość ({vaultItems.length})</span>
                <span className={isVaultUnlocked ? "text-green-500" : "text-gray-600"}>
                    {isVaultUnlocked ? "ODBLOKOWANE" : "ZABLOKOWANE"}
                </span>
            </h3>
            <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
                {vaultItems.length === 0 && <p className="text-[10px] text-gray-700 text-center">Pusto...</p>}
                
                {vaultItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-gray-900 p-2 hover:bg-gray-800 transition-colors">
                        <div className="flex flex-col overflow-hidden">
                             {item.decryptedTitle ? (
                                <span className="text-sm font-bold text-white tracking-wide truncate">{item.decryptedTitle}</span>
                            ) : (
                                <span className="text-[10px] text-gray-400 font-mono">ID: {item.id}</span>
                            )}
                        </div>
                        
                        <button 
                            onClick={() => handleDecryptItem(item.content)}
                            className={`text-[10px] px-2 border transition-all uppercase ${item.decryptedTitle ? 'text-green-400 border-green-500 hover:bg-green-500 hover:text-black' : 'text-neon-blue border-neon-blue hover:bg-neon-blue hover:text-white'}`}
                        >
                            {item.decryptedTitle ? "Pokaż" : "Odszyfruj"}
                        </button>
                    </div>
                ))}
            </div>
          </div>

          {/* Logi */}
          <div className="mt-4 p-4 bg-black border border-gray-800 font-mono text-xs text-gray-500 h-24 overflow-hidden flex flex-col justify-end shrink-0">
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