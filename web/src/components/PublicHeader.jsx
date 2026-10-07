import { Link } from "react-router-dom";
import { AdminBrand, Icon } from "../admin";
export default function PublicHeader() {
  return <nav className="public-nav" aria-label="Public navigation"><Link className="public-school-brand" to="/"><AdminBrand /></Link><div className="public-page-actions"><Link className="admin-button secondary" to="/verify"><Icon name="shield" size={15} />Verify receipt</Link><Link className="admin-button primary" to="/vote"><Icon name="key" size={15} />Token login</Link></div></nav>;
}
