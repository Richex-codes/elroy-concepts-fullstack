import { Navigate, Outlet } from "react-router-dom";
import {jwtDecode} from "jwt-decode"

const PrivateRoute = () => {
    const token = localStorage.getItem('token');
    let istoken = false;

    if(token){
        try{
        const currentTime = new Date() / 1000;
        const decodedTime = jwtDecode(token);
        if(decodedTime.exp > currentTime){
            istoken = true;
        }
        } catch(e){
            console.error('Invalid token:', e);
        }
    }
    return istoken? <Outlet /> : <Navigate to="/login" replace/>;
}

export default PrivateRoute;