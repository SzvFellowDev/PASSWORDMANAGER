package main

import (
	"net/http"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

type SecretData struct {
	Content string `json:"content"`
}

var fakeDatabase string = ""

func main() {
	r := gin.Default()

	config := cors.DefaultConfig()
	config.AllowOrigins = []string{"http://localhost:5173"}
	config.AllowMethods = []string{"POST", "GET"}
	r.Use(cors.New(config))

	r.POST("/api/save", func(c *gin.Context) {
		var incomingData SecretData

		if err := c.BindJSON(&incomingData); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"ERROR": "Błędne dane"})
			return
		}

		fakeDatabase = incomingData.Content

		println(">>> SERWER: Otrzymano i zapisano dane!")
		c.JSON(http.StatusOK, gin.H{"STATUS": "Zapisano w menedżerze haseł"})
	})

	r.GET("/api/load", func(c *gin.Context) {
		if fakeDatabase == "" {
			c.JSON(http.StatusNotFound, gin.H{"ERROR": "Baza jest pusta"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"content": fakeDatabase})
	})

	println("SYSTEM: Backend startuje na porcie 8080...")
	r.Run(":8080")
}
