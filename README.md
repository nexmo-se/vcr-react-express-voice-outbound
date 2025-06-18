# template-vcr-react-express

Boiler Plate for VCR + ReactJS + ExpressJS

## Work History

1. Requires 2 VCR application ID's first for frontend and second for backend.
2. Created two directories: `backend` and `frontend`.
3. In the `frontend` directory:
   - Ran `npx create-react-app .` to create a new ReactJS project in the empty directory.
   - Ran `vcr init` and created a new app named `vcr-react-frontend`.
4. In the `backend` directory:
   - Ran `vcr init` and created a new app named `vcr-react-backend`.
   - Chose "Starter App" as the VCR application template.

## Deployment

To deploy, run the following command in each folder (`frontend` and `backend`):

```sh
vcr deploy
```

I now have 2 VCR applicaitons /frontend serves a reactJS app and the /backend that serves the backend for it. The vcr deploy for backend URL is https://neru-4f2ff535-epic-call-app-backend-dev.use1.runtime.vonage.cloud

The vcr deploy for frontend URL is https://neru-4f2ff535-epic-call-app-frontend-dev.use1.runtime.vonage.cloud
