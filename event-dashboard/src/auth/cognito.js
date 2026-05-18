import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
} from "amazon-cognito-identity-js";

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId:   import.meta.env.VITE_COGNITO_CLIENT_ID,
});

export function signIn(username, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: username, Pool: userPool });
    const auth = new AuthenticationDetails({ Username: username, Password: password });

    user.setAuthenticationFlowType("USER_PASSWORD_AUTH");
    user.authenticateUser(auth, {
      onSuccess: resolve,
      onFailure: reject,
      newPasswordRequired: (_userAttrs, _requiredAttrs) => {
        reject({ code: "NewPasswordRequired", user });
      },
    });
  });
}

export function signOut() {
  const user = userPool.getCurrentUser();
  if (user) user.signOut();
}

export function getSession() {
  return new Promise((resolve) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err, session) => {
      resolve(!err && session?.isValid() ? session : null);
    });
  });
}
