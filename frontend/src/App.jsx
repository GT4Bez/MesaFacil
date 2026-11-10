import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Tables from './pages/Tables';
import Order from './pages/Order';
import Cashier from './pages/Cashier';

function PrivateLayout(){return <ProtectedRoute><Layout/></ProtectedRoute>;}
export default function App(){
  const {isAuthenticated}=useAuth();
  return <Routes>
    <Route path="/login" element={isAuthenticated?<Navigate to="/tables" replace/>:<Login/>}/>
    <Route element={<PrivateLayout/>}>
      <Route path="/tables" element={<Tables/>}/>
      <Route path="/orders/:id" element={<Order/>}/>
      <Route path="/cashier" element={<Cashier/>}/>
    </Route>
    <Route path="*" element={<Navigate to={isAuthenticated?'/tables':'/login'} replace/>}/>
  </Routes>;
}
