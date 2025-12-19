PROJEKT: AHNS Password Manager w systemie Zero-Knowledge
AUTOR: Krystian Szaliński | Cezary Woźniak

OPIS:
Aplikacja typu Client-Server do bezpiecznego przechowywania haseł. 
Wykorzystuje szyfrowanie AES-GCM po stronie przeglądarki. 
Serwer Go przechowuje tylko zaszyfrowane bloby i zapisuje je w pliku vault.json.

WYMAGANIA:
1. Golang
2. Node.js

INSTRUKCJA URUCHOMIENIA:

KROK 1: BACKEND (Serwer API)
1. Otwórz terminal (W katalogu BACKEND)
2. Pobierz zależności: 
   go mod tidy
3. Uruchom serwer: 
   go run main.go
   (Serwer wystartuje na porcie 8080)

KROK 2: FRONTEND (Interfejs React)
1. Otwórz nowy terminal w folderze projektu
2. Pobierz biblioteki: 
   npm install (W katalogu Frontend)
3. Uruchom aplikację:
   npm run dev (W katalogu Frontend)
4. Kliknij w link (np. http://localhost:5173), aby otworzyć aplikację w przeglądarce.

JAK UŻYWAĆ:
1. Wpisz dowolne "Hasło Główne" (Master Password). Zapamiętaj je!
2. Dodaj nowy wpis (Tytuł + Dane).
3. Kliknij "SZYFRUJ I DODAJ".
4. Aby podejrzeć dane, musisz mieć wpisane poprawne Hasło Główne w polu po lewej stronie.