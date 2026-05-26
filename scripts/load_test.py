from locust import HttpUser, between, task


class ApiUser(HttpUser):
    wait_time = between(0.2, 1.0)

    def on_start(self):
        email = f"user-{id(self)}@example.com"
        response = self.client.post("/api/v1/auth/register", json={"email": email, "password": "password123"})
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    @task
    def create_and_fetch_document(self):
        created = self.client.post("/api/v1/documents", json={"title": "Load Doc", "content": "hello"}, headers=self.headers)
        if created.status_code == 201:
            doc_id = created.json()["id"]
            self.client.get(f"/api/v1/documents/{doc_id}", headers=self.headers)

