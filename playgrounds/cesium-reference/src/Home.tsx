import { Link } from "react-router-dom";
import { views } from "./config.views";

const Home: React.FC = () => {
  return (
    <div>
      <h1>Available Views</h1>
      <ul>
        {views.map((view) => (
          <li key={view.path}>
            <Link to={view.path}>{view.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Home;
