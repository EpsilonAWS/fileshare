import { createBrowserRouter } from "react-router";
import { RootLayout } from "@/routes/RootLayout";
import { UploadPage } from "@/routes/UploadPage";
import { VaultPage } from "@/routes/VaultPage";
import { NotFoundPage } from "@/routes/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <UploadPage /> },
      { path: "/vault/:shareToken", element: <VaultPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
