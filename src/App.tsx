import { BrowserRouter } from "react-router-dom";
import Workspace from "./redesign/Workspace";
import { PwaRuntime } from "./redesign/PwaNative";
import "./redesign/workspace.css";
import "./redesign/vivid.css";
import "./redesign/human.css";
import "./redesign/pwa-native.css";

export default function App() {
  return (
    <BrowserRouter>
      <Workspace />
      <PwaRuntime />
    </BrowserRouter>
  );
}
