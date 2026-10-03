import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { HomePage } from "./pages/home";

import "./styles.css";

const loadReactGrab = async () => {
  try {
    await import("react-grab");
  } catch (error) {
    console.error("Failed to load react-grab in development.", error);
  }
};

if (import.meta.env.DEV) {
  void loadReactGrab();
}

const rootRoute = createRootRoute({ component: () => <HomePage /> });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector<HTMLDivElement>("#root");

if (!rootElement) {
  throw new Error("Missing application root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

const registerServiceWorker = async (): Promise<void> => {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  let updatePending = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (updatePending) {
      window.location.reload();
    }
  });

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    const notifyUpdateAvailable = () => {
      if (navigator.serviceWorker.controller) {
        updatePending = true;
        window.dispatchEvent(new Event("app-update-available"));
      }
    };
    registration.addEventListener("updatefound", () => {
      const { installing } = registration;
      installing?.addEventListener("statechange", () => {
        if (installing.state === "installed") {
          notifyUpdateAvailable();
        }
      });
    });
    if (registration.waiting) {
      notifyUpdateAvailable();
    }
  } catch {
    console.error("Failed to register the offline app shell.");
  }
};

window.addEventListener("load", registerServiceWorker);
