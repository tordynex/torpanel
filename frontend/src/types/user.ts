export interface User {
  id: number;
  username: string;
  email: string;
  role: "owner" | "workshop_user";
}

export interface UserCreate {
  username: string;
  email: string;
  password: string;
  role: "owner" | "workshop_user";
}
