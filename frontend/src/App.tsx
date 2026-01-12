import { useState, useEffect } from 'react';

interface VaultItem {
  id: string;
  content: string;
  created_at: string;
  decryptedTitle?: string; 
}

function App() {
  const [masterPassword, setMasterPassword] = useState('');
  const [inputTitle, setInputTitle] = useState('');
  const [inputSecret, setInputSecret] = useState('');
  
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [decryptedView, setDecryptedView] = useState<string>('');
  const [logs, setLogs] = useState<string[]>(['> Inicjalizacja...', '> Gotowy do pracy...']);

  const [editingId, setEditingId] = useState<string | null>(null);

  //Dodawanie wpisów w konsoli
  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`].slice(-5));

  //Sprawdzenie czy elementy są odszyfrowane
  const isVaultUnlocked = vaultItems.some(item => item.decryptedTitle);


  const refreshVault = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/all');
      if (response.ok) {
        const data = await response.json();

        const cleanItems = (data.items || []).map((i: any) => ({
             ...i, 
             decryptedTitle: undefined 
        }));
        setVaultItems(cleanItems);
      }
    } catch (e) {
      addLog("BŁĄD SIECI: Nie można pobrać listy.");
    }
  };

  useEffect(() => {
    refreshVault();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć ten wpis? Operacji nie można cofnąć.")) return;

    try {
        await fetch(`http://localhost:8080/api/delete/${id}`, { method: 'DELETE' });
        addLog("USUNIĘTO dane z bazy.");
        
        if (editingId === id) {
            cancelEdit();
        }
        refreshVault();
    } catch (e) {
        addLog("BŁĄD: Nie udało się usunąć wpisu.");
    }
  };


  const getKey = async (passwordOverride?: string) => {
    const passwordToUse = passwordOverride || masterPassword;
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(passwordToUse), { name: "PBKDF2" }, false, ["deriveKey"]
    );
    const salt = enc.encode("sol-apki"); 
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  };

  const tryDecryptTitle = async (blob: string, key: CryptoKey): Promise<string | null> => {
    try {
      const [ivHex, encryptedHex] = blob.split(':');
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedBytes);
      const data = JSON.parse(new TextDecoder().decode(decryptedContent));
      return data.title;
    } catch (e) { return null; }
  };

  useEffect(() => {
    const handleVisibility = async () => {
      if (!masterPassword) {
         setVaultItems(prev => {
             if (prev.some(item => item.decryptedTitle)) {
                 return prev.map(item => ({ ...item, decryptedTitle: undefined }));
             }
             return prev;
         });
         setDecryptedView('');
         return;
      }

      try {
        const key = await getKey(masterPassword);
        const updatedItems = await Promise.all(vaultItems.map(async (item) => {
          const title = await tryDecryptTitle(item.content, key);
          return { ...item, decryptedTitle: title || undefined };
        }));

        setVaultItems(prev => {
           const hasChanges = JSON.stringify(prev) !== JSON.stringify(updatedItems);
           return hasChanges ? updatedItems : prev;
        });

        if (!updatedItems.some(i => i.decryptedTitle)) {
             setDecryptedView('');
        }
      } catch (e) { }
    };
    const timeoutId = setTimeout(handleVisibility, 300);
    return () => clearTimeout(timeoutId);
  }, [masterPassword, vaultItems.length]); 

  const startEditing = async (item: VaultItem) => {
    if (!masterPassword) {
        addLog("ERROR: Podaj hasło główne aby edytować!");
        return;
    }
    try {
        const key = await getKey();
        // Odszyfrowanie pełnej zawartości
        const [ivHex, encryptedHex] = item.content.split(':');
        const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
        
        const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedBytes);
        const data = JSON.parse(new TextDecoder().decode(decryptedContent));

        //Wstawienie danych do formularza
        setInputTitle(data.title);
        setInputSecret(data.secret);
        setEditingId(item.id);
        addLog("TRYB EDYCJI: Zmień dane i zapisz.");
    } catch(e) {
        addLog("ERROR: Nie można odszyfrować do edycji.");
    }
  };

  const cancelEdit = () => {
      setEditingId(null);
      setInputTitle('');
      setInputSecret('');
      addLog("Anulowano edycję.");
  };

  //Szyfrowanie i zapis
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
      const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv }, key, encodedData
      );

      const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
      const encryptedHex = Array.from(new Uint8Array(encryptedContent)).map(b => b.toString(16).padStart(2, '0')).join('');
      const fullBlob = `${ivHex}:${encryptedHex}`;
      
      if (editingId) {
          //EDYCJA
          addLog("SIEĆ: Aktualizowanie wpisu...");
          await fetch(`http://localhost:8080/api/edit/${editingId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: fullBlob })
          });
          addLog("SUKCES: Zaktualizowano wpis!");
          setEditingId(null);
      } else {
          //DODAWANIE
          addLog("SIEĆ: Wysyłanie nowego wpisu...");
          await fetch('http://localhost:8080/api/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: fullBlob })
          });
          addLog("SUKCES: Dodano nowy wpis!");
      }

      refreshVault();
      setInputTitle('');
      setInputSecret('');

    } catch (e) {
      addLog("ERROR! Błąd szyfrowania.");
      console.error(e);
    }
  };

  //Podgląd danych
  const handleDecryptItem = async (blob: string) => {
    if (!masterPassword) { addLog("ERROR: Podaj hasło główne!"); return; }
    try {
      const key = await getKey();
      const [ivHex, encryptedHex] = blob.split(':');
      const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const encryptedBytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
      const decryptedContent = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedBytes);
      const decryptedString = new TextDecoder().decode(decryptedContent);
      const data = JSON.parse(decryptedString);

      setDecryptedView(`Serwis: ${data.title}\nHasło: ${data.secret}`);
      addLog("Przyznanie dostępu!");
    } catch (e) {
      addLog("Odmowa dostępu!");
      setDecryptedView('Błąd odszyfrowywania!');
    }
  };

  return (
    <div className="min-h-screen bg-bunker-dark text-bunker-text font-mono flex items-center justify-center p-4">
      <div className="w-full max-w-2xl border-2 border-gray-700 bg-bunker-panel shadow-2xl relative flex flex-col max-h-[90vh]">
        
        {/* NAGŁÓWEK */}
        <div className="flex justify-between items-center bg-gray-800 p-2 border-b-2 border-gray-700 shrink-0">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-gray-300">AHNS Password Manager</span>
            <span className="text-xs font-bold text-gray-300">Autorzy: Krystian Szaliński | Cezary Woźniak</span>
          </div>
          <div className="flex gap-2">
            <div className={`w-3 h-3 rounded-full transition-all ${isVaultUnlocked ? 'bg-green-500 shadow-[0_0_8px_rgba(0,255,0,0.8)]' : 'bg-red-500'}`}></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-50"></div>
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
          </div>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          <h1 className="text-3xl font-bold text-neon-blue tracking-wider text-center uppercase border-b border-gray-700 pb-4">
            {editingId ? "EDYCJA WPISU" : "Menedżer Haseł"}
          </h1>

          {/* FORMULARZ */}
          <div className={`space-y-4 p-4 border ${editingId ? 'border-yellow-500 bg-yellow-900/10' : 'border-transparent'}`}>
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
                <label className="text-xs uppercase text-gray-500 tracking-widest">Serwis {editingId && "(Edycja)"}</label>
                <input 
                    type="text" 
                    value={inputTitle}
                    onChange={(e) => setInputTitle(e.target.value)}
                    className={`w-full bg-gray-900 border p-3 text-white focus:outline-none ${editingId ? 'border-yellow-500' : 'border-gray-600 focus:border-neon-blue'}`}
                    placeholder=""
                />
               </div>
               <div>
                <label className="text-xs uppercase text-gray-500 tracking-widest">Hasło {editingId && "(Edycja)"}</label>
                <input 
                    type="text" 
                    value={inputSecret}
                    onChange={(e) => setInputSecret(e.target.value)}
                    className={`w-full bg-gray-900 border p-3 text-white focus:outline-none ${editingId ? 'border-yellow-500' : 'border-gray-600 focus:border-neon-blue'}`}
                    placeholder=""
                />
               </div>
            </div>
          </div>

          {/* PRZYCISKI AKCJI */}
          <div className="grid grid-cols-2 gap-4">
            {editingId ? (
                <>
                    <button onClick={handleEncryptAndSave} className="bg-yellow-600 text-white hover:bg-yellow-500 p-3 font-bold transition-all uppercase text-xs">
                        ZAPISZ ZMIANY
                    </button>
                    <button onClick={cancelEdit} className="bg-gray-700 text-gray-300 hover:bg-gray-600 p-3 font-bold transition-all uppercase text-xs">
                        ANULUJ
                    </button>
                </>
                   ) : (
                <>
                    <button onClick={handleEncryptAndSave} className="bg-gray-800 border border-neon-blue text-neon-blue hover:bg-neon-blue hover:text-white p-3 font-bold transition-all uppercase text-xs">
                        SZYFRUJ I DODAJ
                    </button>
                    <button onClick={refreshVault} className="bg-gray-800 border border-gray-600 text-yellow-500 hover:border-yellow-500 hover:text-white p-3 font-bold transition-all uppercase text-xs">
                        ODŚWIEŻ LISTĘ
                    </button>
                </>
            )}
          </div>
          
          {/* Wynik odszyfrowania (Podgląd) */}
          {decryptedView && !editingId && (
             <div className={`p-4 border ${decryptedView.includes('!') ? 'border-red-500 bg-red-900/20' : 'border-green-500/30 bg-green-900/20'}`}>
                <label className="text-[10px] uppercase opacity-70">Twoje dane: </label>
                <p className={`whitespace-pre-wrap ${decryptedView.includes('!') ? 'text-red-500 font-bold' : 'text-green-400 font-bold'}`}>{decryptedView}</p>
             </div>
          )}

          {/* LISTA WPISÓW */}
          <div className="border border-gray-700 bg-black/50 p-2">
            <h3 className="text-xs text-gray-500 mb-2 uppercase border-b border-gray-800 pb-1 flex justify-between">
                <span>Zawartość ({vaultItems.length})</span>
                <span className={isVaultUnlocked ? "text-green-500" : "text-gray-600"}>
                    {isVaultUnlocked ? "ODBLOKOWANE" : "ZABLOKOWANE"}
                </span>
            </h3>
            <div className="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
                {vaultItems.length === 0 && <p className="text-[10px] text-gray-700 text-center">Pusto...</p>}
                
                {vaultItems.map((item) => (
                    <div key={item.id} className={`flex justify-between items-center bg-gray-900 p-2 hover:bg-gray-800 transition-colors border-l-2 ${editingId === item.id ? 'border-yellow-500 bg-yellow-900/20' : 'border-transparent'}`}>
                        <div className="flex flex-col overflow-hidden max-w-[50%]">
                             {item.decryptedTitle ? (
                                <span className="text-sm font-bold text-white tracking-wide truncate">{item.decryptedTitle}</span>
                            ) : (
                                <span className="text-[10px] text-gray-400 font-mono">ID: {item.id}</span>
                            )}
                        </div>
                        
                        <div className="flex gap-2">
                            {/* PRZYCISK POKAŻ */}
                            <button 
                                onClick={() => handleDecryptItem(item.content)}
                                className="text-[10px] px-2 py-1 border border-gray-600 text-gray-400 hover:text-white hover:border-white transition-all uppercase"
                            >
                                Pokaż
                            </button>

                            {/* PRZYCISK EDYTUJ */}
                            {item.decryptedTitle && (
                                <button 
                                    onClick={() => startEditing(item)}
                                    className="text-[10px] px-2 py-1 border border-yellow-700 text-yellow-500 hover:bg-yellow-600 hover:text-white transition-all uppercase"
                                >
                                    Edytuj
                                </button>
                            )}

                            {/* PRZYCISK USUŃ */}
                            <button 
                                onClick={() => handleDelete(item.id)}
                                className="text-[10px] px-2 py-1 border border-red-900 text-red-500 hover:bg-red-600 hover:text-white transition-all uppercase"
                            >
                                X
                            </button>
                        </div>
                    </div>
                ))}
            </div>
          </div>

          {/* LOGI */}
          <div className="mt-4 p-4 bg-black border border-gray-800 font-mono text-xs text-gray-500 h-24 overflow-hidden flex flex-col justify-end shrink-0">
            {logs.map((log, i) => (
              <p key={i} className={
                  log.includes("ERROR") || log.includes("Odmowa") || log.includes("BŁĄD") ? "text-red-500" : 
                  log.includes("SUKCES") || log.includes("Przyznanie") || log.includes("Zaktualizowano") ? "text-green-500" : 
                  log.includes("EDYCJA") ? "text-yellow-500" : ""
              }>
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