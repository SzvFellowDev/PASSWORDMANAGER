package main

import (
	"encoding/json"
	"net/http"
	"os"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type VaultItem struct {
	ID        string `json:"id"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

var database []VaultItem

const dbFile = "vault.json"

func saveData() {
	data, err := json.MarshalIndent(database, "", "  ")
	if err != nil {
		println("ERROR: Nie można zapisać bazy danych!")
		return
	}
	os.WriteFile(dbFile, data, 0644)
}

func loadData() {
	data, err := os.ReadFile(dbFile)
	if err != nil {
		println("SYSTEM: Brak pliku bazy danych. Tworzę nową bazę")
		return
	}
	json.Unmarshal(data, &database)
	println("SYSTEM: Załadowano dane z pliku:", len(database))
}

func main() {
	loadData()

	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"http://localhost:5173"}
	config.AllowMethods = []string{"POST", "GET", "DELETE", "PUT"}
	r.Use(cors.New(config))

	//dodawanie danych
	r.POST("/api/add", func(c *gin.Context) {
		var newItem VaultItem
		if err := c.BindJSON(&newItem); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Błędne dane"})
			return
		}
		newItem.ID = time.Now().Format("20060102150405")
		newItem.CreatedAt = time.Now().Format("2006-01-02 15:04:05")

		database = append(database, newItem)
		saveData()
		c.JSON(http.StatusOK, gin.H{"STATUS": "Dodano", "id": newItem.ID})
	})

	//pobieranie danych
	r.GET("/api/all", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"items": database})
	})

	//usuwanie danych
	r.DELETE("/api/delete/:id", func(c *gin.Context) {
		id := c.Param("id")
		newDb := []VaultItem{}
		found := false

		for _, item := range database {
			if item.ID != id {
				newDb = append(newDb, item)
			} else {
				found = true
			}
		}

		if !found {
			c.JSON(http.StatusNotFound, gin.H{"ERROR": "Nie znaleziono danych"})
			return
		}

		database = newDb
		saveData()
		println(">>> SERWER: Usunięto dane ID:", id)
		c.JSON(http.StatusOK, gin.H{"STATUS": "Usunięto dane"})
	})

	//edycja wpisów
	r.POST("/api/edit/:id", func(c *gin.Context) {
		id := c.Param("id")
		var input VaultItem
		if err := c.BindJSON(&input); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ERROR": "Błędne dane"})
			return
		}

		found := false
		for i, item := range database {
			if item.ID == id {
				database[i].Content = input.Content
				found = true
				break
			}
		}

		if !found {
			c.JSON(http.StatusNotFound, gin.H{"ERROR": "Nie znaleziono danych!"})
			return
		}

		saveData()
		println(">>>SERWER: Zaktualizowano dane ID:", id)
		c.JSON(http.StatusOK, gin.H{"STATUS": "Zaktualizowano"})
	})

	println("SYSTEM: startuje na porcie 8080...")
	r.Run(":8080")
}
