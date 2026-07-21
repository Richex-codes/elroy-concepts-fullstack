import axios from "axios";

const api = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
    timeout: 20000,
})

// A 401 almost always means the token is missing/expired/invalid -- without
// this, an expired session just makes every request silently fail forever,
// with no indication to the user that they need to log back in.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      const token = localStorage.getItem("token");
      if (token) {
        // Best-effort: record this as a session-timeout logout in the audit
        // trail. Uses a bare fetch (not the `api` instance) so a failure here
        // can't recursively re-trigger this same 401 interceptor.
        fetch(`${process.env.REACT_APP_API_URL}/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reason: "timeout" }),
        }).catch(() => {});
      }
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;