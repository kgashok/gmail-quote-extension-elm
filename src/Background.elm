port module Background exposing (main)

{-| Background service-worker logic.

All Chrome API calls live in the JS wrapper (background.js).
This module owns the pure routing logic:
  - A context-menu click      → forward (tabId, text) to the content script
  - A keyboard-shortcut fire  → forward (tabId, text) to the content script
-}

import Platform


-- MODEL


type alias Model =
    {}


-- MSG


type Msg
    = ContextMenuClicked TabMsg
    | CommandFired TabMsg


type alias TabMsg =
    { tabId : Int, text : String }


-- INIT


init : () -> ( Model, Cmd Msg )
init _ =
    ( {}, Cmd.none )


-- UPDATE


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        ContextMenuClicked payload ->
            ( model, sendQuoteReply payload )

        CommandFired payload ->
            ( model, sendQuoteReply payload )


-- SUBSCRIPTIONS


subscriptions : Model -> Sub Msg
subscriptions _ =
    Sub.batch
        [ onContextMenuClicked ContextMenuClicked
        , onCommandFired CommandFired
        ]


-- MAIN


main : Program () Model Msg
main =
    Platform.worker
        { init = init
        , update = update
        , subscriptions = subscriptions
        }


-- PORTS — incoming (JS → Elm)


port onContextMenuClicked : ({ tabId : Int, text : String } -> msg) -> Sub msg


port onCommandFired : ({ tabId : Int, text : String } -> msg) -> Sub msg


-- PORTS — outgoing (Elm → JS)


port sendQuoteReply : { tabId : Int, text : String } -> Cmd msg
