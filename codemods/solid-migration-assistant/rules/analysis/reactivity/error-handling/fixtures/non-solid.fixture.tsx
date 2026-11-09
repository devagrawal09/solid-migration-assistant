import { onError, catchError, resetErrorBoundaries } from "other-library";

onError();
catchError((err) => console.error(err));
resetErrorBoundaries();
