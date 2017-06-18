import React from 'react';
import autobind from 'autobind-decorator';
import cssModules from 'react-css-modules';
import { Card, CardTitle, CardText } from 'material-ui/Card';
import Snackbar from 'material-ui/Snackbar';
import PropTypes from 'prop-types';

import DeleteModal from '../../components/DeleteModal/DeleteModal';
import AvailabilityGrid from '../AvailabilityGrid/AvailabilityGrid';
import styles from './event-details-component.css';
import ParticipantsList from '../../components/ParticipantsList/ParticipantsList';
import BestTimesDisplay from '../../components/BestTimeDisplay/BestTimeDisplay';
import SelectedDatesEditor from '../../components/SelectedDatesEditor/SelectedDatesEditor';
import { datesToDatesObject, isCurParticip, eventAllParticipIds } from './EventDetailsComponentUtil';
import { isEvent, isCurUser } from '../../util/commonPropTypes';

class EventDetailsComponent extends React.Component {
  constructor(props) {
    super(props);
    const { event } = props;
    this.state = {
      event,
      dates: datesToDatesObject(event),
      eventParticipantsIds: eventAllParticipIds(event),
      showHeatmap: false,
      myAvailability: [],
      showButtonAviability: 'none',
      showAvailabilityGrid: 'block',
      isParticipant: true,
      snackBarOpen: false,
      snackBarMsg: '',
      heightlightedUser: '',
      isOwner: false,
    };
  }

  async componentWillMount() {
    const { curUser, event } = this.props;
    if (curUser) {
      let showHeatmap = false;
      let showAvailabilityGrid = 'block';
      let myAvailability = [];
      const isOwner = event.owner === curUser._id;
      // find actual user participant record
      const isCurParticipant = isCurParticip(curUser, event);
      // if curUser have aviability show heatMap
      if (isCurParticipant) {
        if (isCurParticipant.availability) {
          myAvailability = isCurParticipant.availability;
          if (myAvailability.length > 0) {
            showHeatmap = true;
            showAvailabilityGrid = 'none';
          }
        }
      } else {
        showHeatmap = false;
        showAvailabilityGrid = 'block';
        this.setState({
          isParticipant: false,
          snackBarOpen: true,
          snackBarMsg: 'Please add your availability to join the event.',
        });
      }
      this.setState({ showHeatmap, showAvailabilityGrid, myAvailability, isOwner });
    }
  }

  componentWillReceiveProps(nextProps) {
    const dates = datesToDatesObject(nextProps.event);
    this.setState({ event: nextProps.event, dates });
  }

  async sendEmailOwner(event) {
    const response = this.props.cbHandleEmailOwner(event);
    if (!response) console.log('sendEmailOwner error');
  }

  async sendEmailOwnerEdit(event) {
    const response = this.props.cbHandleEmailOwnerEdit(event);
    if (!response) console.log('sendEmailOwnerEdit error');
  }

  @autobind
  showAvailability() {
    this.setState({ showButtonAviability: 'hidden', showAvailabilityGrid: 'block' });
  }

  @autobind
  closeGrid() {
    this.setState({ showHeatmap: true, showAvailabilityGrid: 'none' });
  }

  @autobind
  editAvail() {
    this.setState({ showHeatmap: false, showButtonAviability: 'none', showAvailabilityGrid: 'block' });
  }

  @autobind
  async submitEditDates(patches) {
    const { event } = this.props;
    try {
      const responseEvent = await this.props.cbEditEvent(patches, event._id);
      this.setState({ event: responseEvent });
    } catch (err) {
      console.log('err at submitEditDates, EventDtailComponent', err);
    }
  }

  @autobind
  async submitAvailability(patches) {
    const { event, curUser } = this.props;
    const oldMe = event.participants.find(participant =>
      participant.userId._id === curUser._id,
    );
    const responseEvent = await this.props.cbEditEvent(patches, event._id);
    if (responseEvent) {
      const me = isCurParticip(curUser, responseEvent);
      this.setState({
        showHeatmap: true,
        event: responseEvent,
        participants: responseEvent.participants,
        myAvailability: me.availability,
      });
      if (curUser._id !== event.owner) {
        if (oldMe.status === 3) {
          // send email edit
          await this.sendEmailOwnerEdit(responseEvent);
        } else {
          await this.sendEmailOwner(responseEvent);
        }
      }
      return responseEvent;
    }
    console.log('Error at EventDetailComponent submitAvailability');
  }

  @autobind
  handleShowInviteGuestsDrawer() {
    const { event } = this.state;
    this.props.showInviteGuests(event);
  }

  @autobind
  async handleDeleteGuest(guestToDelete) {
    const nEvent = await this.props.cbDeleteGuest(guestToDelete);
    this.setState({ event: nEvent });
    return nEvent;
  }

  renderSnackBar() {
    const { snackBarOpen, snackBarMsg } = this.state;
    return (
      <Snackbar
        style={{ border: '5px solid #fffae6' }}
        bodyStyle={{ height: 'flex' }}
        contentStyle={{ fontSize: '16px', textAlign: 'center' }}
        open={snackBarOpen}
        message={snackBarMsg}
        action="dismiss"
        autoHideDuration={5000}
        onRequestClose={() => this.setState({ snackBarOpen: false })}
        onActionTouchTap={() => this.setState({ snackBarOpen: false })}
      />
    );
  }

  renderDeleteButton() {
    const { isOwner, event } = this.state;
    const { cbDeleteEvent } = this.props;
    return (isOwner) ? <DeleteModal event={event} cbEventDelete={() => cbDeleteEvent(event._id)} />
      : null;
  }

  renderEditDatesButton() {
    const { isOwner, event } = this.state;
    return (isOwner) ?
      <SelectedDatesEditor event={event} submitDates={this.submitEditDates} /> : null;
  }

  render() {
    const { event, showHeatmap, dates, heightlightedUser } = this.state;
    const { curUser } = this.props;
    return (
      <div styleName="wrapper">
        <div>
          <Card styleName="card">
            {this.renderDeleteButton()}
            <CardTitle styleName="cardTitle">{event.name}</CardTitle>
            <CardText>
              <BestTimesDisplay event={event} disablePicker />
              {this.renderEditDatesButton()}
              <AvailabilityGrid
                event={event}
                curUser={curUser}
                dates={dates}
                editAvail={this.editAvail}
                submitAvail={this.submitAvailability}
                showHeatmap={showHeatmap}
                closeEditorGrid={this.closeGrid}
                heightlightedUser={heightlightedUser}
              />
              <br />
              <ParticipantsList
                event={event}
                curUser={curUser}
                showInviteGuests={this.handleShowInviteGuestsDrawer}
                cbDeleteGuest={this.handleDeleteGuest}
                cbOnChipMouseOver={guest => this.setState({ heightlightedUser: guest })}
                cbOnChipMouseLeave={() => this.setState({ heightlightedUser: '' })}
              />
            </CardText>
          </Card>
        </div>
        {this.renderSnackBar()}
      </div>
    );
  }
}

EventDetailsComponent.defaultProps = {
  event: () => { console.log('event prop validation not set!'); },
  curUser: () => { console.log('curUser prop validation not set!'); },
};

EventDetailsComponent.propTypes = {
  showInviteGuests: PropTypes.func.isRequired,
  cbDeleteEvent: PropTypes.func.isRequired,
  cbEditEvent: PropTypes.func.isRequired,
  cbHandleEmailOwner: PropTypes.func.isRequired,
  cbHandleEmailOwnerEdit: PropTypes.func.isRequired,
  cbDeleteGuest: PropTypes.func.isRequired,

  // Current user
  curUser: isCurUser,
  // Event containing list of event participants
  event: isEvent,
};

export default cssModules(EventDetailsComponent, styles);
